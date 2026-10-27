using System.IO.Compression;
using Api.Import;
using Microsoft.AspNetCore.Http;
using Limits = Api.Import.ProductImportEndpointHelpers.ImportLimits;

namespace UnitTests.Api;

/// <summary>
/// El .zip de la importación masiva de fotos se descomprime en el disco del
/// servidor. Antes se extraía todo lo que trajera: un .zip de pocos KB que
/// descomprime gigas (o cien mil archivos) llenaba el disco. Ahora lo
/// descomprimido se cuenta mientras se escribe, sin creer lo que el .zip
/// declara.
/// </summary>
public sealed class ProductImportZipTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("tiendafy-zip-test").FullName;

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    private static FormFile ZipFile(params (string Name, byte[] Content)[] entries)
    {
        var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            foreach (var (name, content) in entries)
            {
                using var s = zip.CreateEntry(name).Open();
                s.Write(content);
            }
        ms.Position = 0;
        return new FormFile(ms, 0, ms.Length, "files", "fotos.zip");
    }

    private Task<SharedKernel.Common.Result<int>> ExtractAsync(IFormFile file, Limits? limits = null) =>
        ProductImportEndpointHelpers.ExtractZipAsync(file, _dir, new(limits ?? Limits.Default), CancellationToken.None);

    private static readonly byte[] Photo = [1, 2, 3];

    [Fact]
    public async Task Extrae_las_fotos_aplanando_las_carpetas()
    {
        var result = await ExtractAsync(ZipFile(("remera.jpg", Photo), ("fotos/buzo-2.png", Photo), ("leeme.txt", Photo)));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value);
        Assert.Equal(["buzo-2.png", "remera.jpg"], Directory.GetFiles(_dir).Select(Path.GetFileName).Order());
    }

    [Theory]
    [InlineData("../remera.jpg")]
    [InlineData("fotos/../../remera.jpg")]
    [InlineData(@"fotos\..\..\remera.jpg")]
    [InlineData("/etc/remera.jpg")]
    [InlineData(@"\remera.jpg")]
    [InlineData("C:/remera.jpg")]
    public async Task Una_ruta_con_puntos_o_absoluta_rechaza_el_zip(string name)
    {
        var result = await ExtractAsync(ZipFile(("buena.jpg", Photo), (name, Photo)));

        Assert.True(result.IsFailure);
        Assert.Equal("Import.ZipBadPath", result.Error.Code);
    }

    [Fact]
    public async Task Pasado_el_tope_de_archivos_se_rechaza()
    {
        var result = await ExtractAsync(
            ZipFile(("a.jpg", Photo), ("b.jpg", Photo), ("c.txt", Photo), ("d.jpg", Photo)),
            Limits.Default with { MaxEntries = 3 });

        Assert.True(result.IsFailure);
        Assert.Equal("Import.ZipTooManyFiles", result.Error.Code);
    }

    [Fact]
    public async Task El_tope_de_archivos_cuenta_entre_todos_los_zip_de_la_subida()
    {
        var budget = new ProductImportEndpointHelpers.ExtractionBudget(Limits.Default with { MaxEntries = 3 });
        var first = await ProductImportEndpointHelpers.ExtractZipAsync(ZipFile(("a.jpg", Photo), ("b.jpg", Photo)), _dir, budget, CancellationToken.None);
        var second = await ProductImportEndpointHelpers.ExtractZipAsync(ZipFile(("c.jpg", Photo), ("d.jpg", Photo)), _dir, budget, CancellationToken.None);

        Assert.True(first.IsSuccess);
        Assert.True(second.IsFailure);
    }

    [Fact]
    public async Task Una_foto_que_descomprime_de_mas_se_saltea_sin_escribirse_entera()
    {
        // 50 KB de ceros: en el .zip ocupa casi nada.
        var result = await ExtractAsync(
            ZipFile(("enorme.png", new byte[50_000]), ("chica.jpg", Photo)),
            Limits.Default with { MaxEntryBytes = 10_000 });

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value);
        Assert.Equal(["chica.jpg"], Directory.GetFiles(_dir).Select(Path.GetFileName));
    }

    [Fact]
    public async Task Pasado_el_total_descomprimido_se_rechaza()
    {
        var result = await ExtractAsync(
            ZipFile(("a.png", new byte[6_000]), ("b.png", new byte[6_000])),
            new Limits(MaxEntries: 100, MaxEntryBytes: 8_000, MaxTotalBytes: 10_000));

        Assert.True(result.IsFailure);
        Assert.Equal("Import.ZipTooLarge", result.Error.Code);
    }

    private static FormFile AsForm(byte[] bytes) =>
        new(new MemoryStream(bytes), 0, bytes.Length, "files", "fotos.zip");

    private static byte[] ManyEmptyEntries(int count)
    {
        var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            for (var i = 0; i < count; i++)
                zip.CreateEntry($"f{i}.jpg", CompressionLevel.NoCompression);
        return ms.ToArray();
    }

    /// <summary>Solo el final de un .zip: un EOCD que declara lo que se le antoje.</summary>
    private static byte[] Eocd(ushort entries, uint directorySize, uint directoryOffset)
    {
        var b = new byte[22];
        BitConverter.GetBytes(0x06054b50u).CopyTo(b, 0);
        BitConverter.GetBytes(entries).CopyTo(b, 10);
        BitConverter.GetBytes(directorySize).CopyTo(b, 12);
        BitConverter.GetBytes(directoryOffset).CopyTo(b, 16);
        return b;
    }

    [Fact]
    public async Task Un_zip_con_muchas_entradas_se_rechaza_antes_de_abrirlo()
    {
        var result = await ExtractAsync(AsForm(ManyEmptyEntries(20_000)));

        Assert.True(result.IsFailure);
        Assert.Equal("Import.ZipTooManyFiles", result.Error.Code);
        Assert.Empty(Directory.GetFiles(_dir));
    }

    [Fact]
    public async Task Un_zip64_con_mas_de_65535_entradas_se_rechaza()
    {
        var bytes = ManyEmptyEntries(70_000);

        // El .zip es de verdad ZIP64: el EOCD trae los campos saturados.
        Assert.Equal(ushort.MaxValue, BitConverter.ToUInt16(bytes, bytes.Length - 22 + 10));
        var result = await ExtractAsync(AsForm(bytes));

        Assert.True(result.IsFailure);
        Assert.Equal("Import.ZipTooManyFiles", result.Error.Code);
    }

    [Fact]
    public async Task La_cuenta_de_entradas_del_eocd_se_mira_sin_leer_el_directorio()
    {
        // Ni siquiera hay directorio: alcanza con lo que el final declara.
        var result = await ExtractAsync(AsForm(Eocd(entries: 60_000, directorySize: 60_000 * 50, directoryOffset: 0)));

        Assert.Equal("Import.ZipTooManyFiles", result.Error.Code);
    }

    [Fact]
    public async Task Un_directorio_desproporcionado_para_sus_entradas_se_rechaza()
    {
        // 3 entradas que dicen ocupar 100 MB de directorio.
        var result = await ExtractAsync(AsForm(Eocd(entries: 3, directorySize: 100 * 1024 * 1024, directoryOffset: 0)));

        Assert.True(result.IsFailure);
        Assert.Equal("Import.ZipTooManyFiles", result.Error.Code);
    }

    [Fact]
    public async Task Las_entradas_del_eocd_cuentan_contra_lo_que_queda_de_cupo()
    {
        var budget = new ProductImportEndpointHelpers.ExtractionBudget(Limits.Default with { MaxEntries = 10 });
        budget.Entries = 8;

        var result = await ProductImportEndpointHelpers.ExtractZipAsync(
            AsForm(ManyEmptyEntries(5)), _dir, budget, CancellationToken.None);

        Assert.Equal("Import.ZipTooManyFiles", result.Error.Code);
    }

    [Fact]
    public async Task Un_zip_vacio_valido_no_se_toma_por_danado()
    {
        var result = await ExtractAsync(AsForm(ManyEmptyEntries(0)));

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Value);
    }

    [Fact]
    public async Task Un_zip_danado_se_rechaza_sin_romper()
    {
        var bytes = "esto no es un zip"u8.ToArray();
        var result = await ExtractAsync(new FormFile(new MemoryStream(bytes), 0, bytes.Length, "files", "fotos.zip"));

        Assert.True(result.IsFailure);
        Assert.Equal("Import.ZipCorrupt", result.Error.Code);
    }

    [Fact]
    public async Task La_copia_con_tope_corta_sin_leer_el_resto()
    {
        var endless = new EndlessStream();
        var copied = await ProductImportEndpointHelpers.CopyCappedAsync(endless, Stream.Null, 1_000_000, CancellationToken.None);

        Assert.Null(copied);
        Assert.InRange(endless.BytesRead, 1_000_001, 1_000_000 + 81_920);
    }

    [Fact]
    public async Task La_copia_con_tope_devuelve_lo_copiado_si_entra()
    {
        using var target = new MemoryStream();
        var copied = await ProductImportEndpointHelpers.CopyCappedAsync(new MemoryStream(new byte[1000]), target, 1000, CancellationToken.None);

        Assert.Equal(1000, copied);
        Assert.Equal(1000, target.Length);
    }

    /// <summary>Una respuesta que no termina nunca (y no dice cuánto pesa).</summary>
    private sealed class EndlessStream : Stream
    {
        public long BytesRead { get; private set; }
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => BytesRead; set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count)
        {
            BytesRead += count;
            return count;
        }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
