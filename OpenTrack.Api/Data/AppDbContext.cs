using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace OpenTrack.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<TrackedContainer> TrackedContainers => Set<TrackedContainer>();

    // SQLite can't ORDER BY DateTimeOffset natively; store as binary. Remove if you switch to SQL Server/Postgres.
    protected override void ConfigureConventions(ModelConfigurationBuilder builder) =>
        builder.Properties<DateTimeOffset>().HaveConversion<DateTimeOffsetToBinaryConverter>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<TrackedContainer>(e =>
        {
            e.Property(x => x.ContainerId).HasMaxLength(11).IsRequired();
            e.Property(x => x.ScacCode).HasMaxLength(4).IsRequired();
            e.Property(x => x.MasterBillNumber).HasMaxLength(40);
            e.Property(x => x.Status).HasMaxLength(60).IsRequired();
            e.HasIndex(x => x.ContainerId).IsUnique();
            e.HasIndex(x => x.MasterBillNumber);
            e.HasIndex(x => x.UpdatedAt);
        });
    }
}
