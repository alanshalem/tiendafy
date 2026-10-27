using System.Buffers.Binary;

namespace Api.Import;

/// <summary>
/// Lee el final de un .zip (End Of Central Directory y, si hace falta, el
/// registro ZIP64) para saber cuántas entradas declara y cuánto ocupa su
/// directorio, ANTES de construir un <see cref="System.IO.Compression.ZipArchive"/>.
/// El <c>ZipArchive</c> materializa en memoria una entrada por cada una del
/// directorio central: un .zip de pocos MB con millones de entradas diminutas
/// ocupaba gigas antes de que el tope de entradas pudiera cortarlo.
/// </summary>
public static class ZipDirectoryGuard
{
    public enum Verdict { Ok, Corrupt, TooManyEntries, DirectoryTooLarge }

    private const uint EocdSignature = 0x06054b50;
    private const uint Zip64LocatorSignature = 0x07064b50;
    private const uint Zip64EocdSignature = 0x06064b50;
    private const int EocdMinSize = 22;
    private const int Zip64LocatorSize = 20;
    private const int MaxCommentSize = ushort.MaxValue;

    /// <summary>Bytes de directorio central que se aceptan por entrada: 46 fijos + nombre + extras, con holgura.</summary>
    private const long DirectoryBytesPerEntry = 1024;

    /// <summary>Directorio central máximo, sea cual sea la cuenta que declare.</summary>
    private const long DirectoryBytesCeiling = 32L * 1024 * 1024;

    /// <summary>
    /// Revisa lo que el .zip declara. <paramref name="maxEntries"/> es lo que
    /// queda de cupo de entradas. No lee el directorio: solo el final del archivo.
    /// </summary>
    public static Verdict Inspect(Stream stream, long maxEntries)
    {
        if (!stream.CanSeek) return Verdict.Corrupt;
        var length = stream.Length;
        if (length < EocdMinSize) return Verdict.Corrupt;

        var tailSize = (int)Math.Min(length, EocdMinSize + MaxCommentSize);
        var tailStart = length - tailSize;
        var tail = new byte[tailSize];
        stream.Position = tailStart;
        stream.ReadExactly(tail);

        var eocd = FindEocd(tail);
        if (eocd < 0) return Verdict.Corrupt;

        ulong entries = BinaryPrimitives.ReadUInt16LittleEndian(tail.AsSpan(eocd + 10));
        ulong directorySize = BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(eocd + 12));
        var directoryOffset = (ulong)BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(eocd + 16));

        // Los campos saturados mandan a leer el registro ZIP64 (los .zip con
        // más de 65.535 entradas o de más de 4 GB lo usan).
        if (entries == ushort.MaxValue || directorySize == uint.MaxValue || directoryOffset == uint.MaxValue)
        {
            var locator = tailStart + eocd - Zip64LocatorSize;
            if (locator >= 0)
            {
                var buffer = new byte[Zip64LocatorSize];
                stream.Position = locator;
                stream.ReadExactly(buffer);
                if (BinaryPrimitives.ReadUInt32LittleEndian(buffer) == Zip64LocatorSignature)
                {
                    var zip64Offset = BinaryPrimitives.ReadUInt64LittleEndian(buffer.AsSpan(8));
                    if (zip64Offset > (ulong)length - 56) return Verdict.Corrupt;
                    var record = new byte[56];
                    stream.Position = (long)zip64Offset;
                    stream.ReadExactly(record);
                    if (BinaryPrimitives.ReadUInt32LittleEndian(record) != Zip64EocdSignature) return Verdict.Corrupt;
                    entries = BinaryPrimitives.ReadUInt64LittleEndian(record.AsSpan(32));
                    directorySize = BinaryPrimitives.ReadUInt64LittleEndian(record.AsSpan(40));
                }
            }
        }

        if (entries > (ulong)Math.Max(0, maxEntries)) return Verdict.TooManyEntries;
        if (directorySize > DirectoryBytesCeiling
            || directorySize > Math.Max(entries, 1UL) * DirectoryBytesPerEntry)
            return Verdict.DirectoryTooLarge;
        // El directorio no puede ser más grande que el archivo que lo contiene.
        if (directorySize > (ulong)length) return Verdict.Corrupt;

        stream.Position = 0;
        return Verdict.Ok;
    }

    /// <summary>La última firma de EOCD cuyo comentario llega justo hasta el final del archivo.</summary>
    private static int FindEocd(byte[] tail)
    {
        for (var i = tail.Length - EocdMinSize; i >= 0; i--)
        {
            if (BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(i)) != EocdSignature) continue;
            var commentLength = BinaryPrimitives.ReadUInt16LittleEndian(tail.AsSpan(i + 20));
            if (i + EocdMinSize + commentLength == tail.Length) return i;
        }
        return -1;
    }
}
