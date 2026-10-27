using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace SharedKernel.Persistence;

/// <summary>
/// Datos personales cifrados en reposo con DataProtection, columna por columna,
/// como hace Customers: el valor viaja descifrado por EF y en la base queda el
/// ciphertext. Cada módulo usa su propio protector (su propio purpose) y este
/// helper solo pone el mecanismo.
///
/// Las filas de antes del cifrado siguen en claro hasta que
/// <see cref="ProtectLegacyRowsAsync{TEntity}"/> las cifra: mientras tanto se
/// leen tal cual. Para distinguirlas no hace falta probar a descifrar: todo
/// payload de DataProtection empieza con su encabezado mágico (0x09F0C9F0),
/// que en base64url es siempre <see cref="ProtectedPrefix"/>, y un teléfono,
/// un documento o una dirección no empiezan así.
/// </summary>
public static class PiiColumns
{
    /// <summary>El encabezado mágico de DataProtection en base64url.</summary>
    public const string ProtectedPrefix = "CfDJ8";

    public static bool IsProtected(string? value) =>
        value is not null && value.StartsWith(ProtectedPrefix, StringComparison.Ordinal);

    /// <summary>Sin protector (design-time de migraciones) el valor queda en claro.</summary>
    public static string? Protect(IDataProtector? protector, string? value) =>
        value is null || protector is null ? value : protector.Protect(value);

    public static string? Unprotect(IDataProtector? protector, string? value)
    {
        if (protector is null || !IsProtected(value)) return value; // null o fila vieja en claro
        try { return protector.Unprotect(value!); }
        catch (CryptographicException) { return value; } // igual que Customers: no rompe la lectura
    }

    /// <summary>
    /// El converter de EF para una columna cifrada. Recibe cómo leer el
    /// protector (no el protector) porque el host lo setea después de que el
    /// modelo puede haberse construido.
    /// </summary>
    public static ValueConverter<string?, string?> Converter(Func<IDataProtector?> protector) =>
        new(v => Protect(protector(), v), v => Unprotect(protector(), v));

    /// <summary>
    /// Cifra, por lotes, las filas que todavía tienen alguna de esas columnas en
    /// claro. Idempotente: lo ya cifrado no se toca y, sin nada pendiente, es
    /// una sola consulta. Va por SQL y no por el change tracker para no pasar por
    /// la lógica de guardado del contexto (numeración, tokens de concurrencia);
    /// cada UPDATE pide que la fila siga como se leyó, así un guardado que
    /// llegue en el medio no se pisa.
    /// </summary>
    /// <returns>Cuántas filas cifró.</returns>
    public static async Task<int> ProtectLegacyRowsAsync<TEntity>(
        DbContext db, IDataProtector protector, IReadOnlyList<string> properties,
        int batchSize = 500, CancellationToken ct = default)
    {
        var entity = db.Model.FindEntityType(typeof(TEntity))
            ?? throw new InvalidOperationException($"{typeof(TEntity).Name} no está en el modelo.");
        var table = Quote(entity.GetTableName()!);
        var key = Quote(entity.FindPrimaryKey()!.Properties.Single().GetColumnName());
        var columns = properties
            .Select(p => Quote((entity.FindProperty(p)
                ?? throw new InvalidOperationException($"{typeof(TEntity).Name}.{p} no está en el modelo.")).GetColumnName()))
            .ToList();

        var pending = string.Join(" OR ", columns.Select(c => $"({c} IS NOT NULL AND {c} NOT LIKE '{ProtectedPrefix}%')"));
        var select = $"SELECT {key}, {string.Join(", ", columns)} FROM {table} WHERE {pending} ORDER BY {key} LIMIT {batchSize}";
        var update = $"UPDATE {table} SET {string.Join(", ", columns.Select((c, i) => $"{c} = @n{i}"))} " +
                     $"WHERE {key} = @id AND {string.Join(" AND ", columns.Select((c, i) => $"{c} IS NOT DISTINCT FROM @o{i}"))}";

        var connection = db.Database.GetDbConnection();
        var opened = connection.State != ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            var total = 0;
            while (true)
            {
                var rows = new List<(object Id, string?[] Values)>();
                await using (var read = connection.CreateCommand())
                {
                    read.CommandText = select;
                    await using var reader = await read.ExecuteReaderAsync(ct);
                    while (await reader.ReadAsync(ct))
                    {
                        var values = new string?[columns.Count];
                        for (var i = 0; i < columns.Count; i++)
                            values[i] = reader.IsDBNull(i + 1) ? null : reader.GetString(i + 1);
                        rows.Add((reader.GetValue(0), values));
                    }
                }
                if (rows.Count == 0) return total;

                var updated = 0;
                foreach (var (id, values) in rows)
                {
                    await using var write = connection.CreateCommand();
                    write.CommandText = update;
                    Add(write, "id", id, null);
                    for (var i = 0; i < values.Length; i++)
                    {
                        var old = values[i];
                        var protectedValue = old is null || IsProtected(old) ? old : protector.Protect(old);
                        Add(write, $"n{i}", protectedValue, DbType.String);
                        Add(write, $"o{i}", old, DbType.String);
                    }
                    updated += await write.ExecuteNonQueryAsync(ct);
                }
                total += updated;
                // Ninguna se pudo escribir (todas cambiaron mientras tanto): las
                // vuelve a levantar la próxima corrida, no un bucle sin fin.
                if (updated == 0) return total;
            }
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    private static void Add(DbCommand command, string name, object? value, DbType? type)
    {
        var p = command.CreateParameter();
        p.ParameterName = name;
        if (type is { } t) p.DbType = t;
        p.Value = value ?? DBNull.Value;
        command.Parameters.Add(p);
    }

    private static string Quote(string identifier) => $"\"{identifier.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
}
