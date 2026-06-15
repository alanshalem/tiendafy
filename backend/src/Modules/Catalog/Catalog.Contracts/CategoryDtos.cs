namespace Catalog.Contracts;

public sealed record CategoryDto(
    Guid Id,
    string Name,
    string Slug,
    Guid? ParentId,
    string Path,
    int Depth);
