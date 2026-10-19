using Catalog.Contracts;
using Catalog.Core.Domain;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Catalog.Core.Features.CreateCategory;

public sealed record CreateCategoryCommand(TenantId TenantId, string Name, Guid? ParentId);

public sealed class CreateCategoryHandler(ICategoryRepository repository, IUnitOfWork unitOfWork)
{
    public async Task<Result<CategoryDto>> HandleAsync(CreateCategoryCommand command, CancellationToken ct = default)
    {
        Category? parent = null;
        if (command.ParentId.HasValue)
        {
            parent = await repository.GetByIdAsync(command.TenantId, command.ParentId.Value, ct);
            if (parent is null)
                return Result.Failure<CategoryDto>(Error.NotFound("Category", command.ParentId.Value));
        }

        var position = await repository.NextPositionAsync(command.TenantId, parent?.Id, ct);
        var categoryResult = Category.Create(command.TenantId, command.Name, parent, position);
        if (categoryResult.IsFailure)
            return Result.Failure<CategoryDto>(categoryResult.Error);

        var category = categoryResult.Value;

        if (await repository.PathExistsAsync(command.TenantId, category.Path, ct))
            return Result.Failure<CategoryDto>(Error.Conflict(
                "Category.Duplicate", $"Ya existe la categoría «{category.Path}»."));

        await repository.AddAsync(category, ct);
        await unitOfWork.SaveChangesAsync(ct);

        return category.ToDto();
    }
}

public static class CategoryMapping
{
    public static CategoryDto ToDto(this Category category) => new(
        category.Id,
        category.Name,
        category.Slug.Value,
        category.ParentId,
        category.Path,
        category.Depth);
}
