using Fleet.Application.Assignments;
using Fleet.Application.Common;
using Fleet.Application.Costs;
using Fleet.Application.Depreciation;
using Fleet.Application.Drivers;
using Fleet.Application.Equipments;
using Fleet.Application.Fuel;
using Fleet.Application.Maintenance;
using Fleet.Application.Projects;
using Fleet.Application.Settings;
using Fleet.Domain.Enums;

namespace Fleet.Api.Endpoints;

public static class FleetEndpoints
{
    public static void MapFleet(this IEndpointRouteBuilder app)
    {
        MapProjects(app);
        MapEquipment(app);
        MapAssignments(app);
        MapDrivers(app);
    }

    private static void MapProjects(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/projects").WithTags("Projects");
        g.MapGet("/", ([AsParameters] ProjectQuery q, ProjectService s, CancellationToken ct) => s.ListAsync(q, ct));
        g.MapGet("/{id:int}", (int id, ProjectService s, CancellationToken ct) => s.GetAsync(id, ct));
        g.MapPost("/", async (ProjectInput input, ProjectService s, CancellationToken ct) => Results.Ok(new { id = await s.CreateAsync(input, ct) }));
        g.MapPut("/{id:int}", async (int id, ProjectInput input, ProjectService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(id, input, ct);
            return Results.NoContent();
        });
        g.MapPut("/{id:int}/status", async (int id, ProjectStatusInput input, ProjectService s, CancellationToken ct) =>
        {
            await s.SetStatusAsync(id, input.Status, ct);
            return Results.NoContent();
        });
        g.MapGet("/{id:int}/assignments", (int id, bool? activeOnly, AssignmentService s, CancellationToken ct) =>
            s.HistoryAsync(null, id, activeOnly ?? false, ct));
        g.MapPost("/{id:int}/assign", async (int id, BulkAssignInput input, AssignmentService s, CancellationToken ct) =>
            Results.Ok(new { count = await s.AssignManyAsync(id, input, ct) }));
        g.MapGet("/{id:int}/costs", async (int id, DateOnly? from, DateOnly? to, CostQueryService s, CancellationToken ct) =>
        {
            var f = new CostFilter { ProjectId = id, From = from, To = to };
            return Results.Ok(new
            {
                totals = await s.TotalsAsync(f, ct),
                byCategory = await s.ByCategoryAsync(f, ct),
                byEquipment = await s.ByEquipmentAsync(f, ct),
                byMonth = await s.ByMonthAsync(f, ct),
            });
        });
    }

    private static void MapEquipment(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/equipment").WithTags("Equipment");
        g.MapGet("/", ([AsParameters] EquipmentQuery q, EquipmentService s, CancellationToken ct) => s.ListAsync(q, ct));
        g.MapGet("/{id:int}", (int id, EquipmentService s, CancellationToken ct) => s.GetAsync(id, ct));
        g.MapGet("/{id:int}/entry-defaults", (int id, DateOnly? date, AssignmentLookup l, Fleet.Application.Abstractions.IClock clock, CancellationToken ct) =>
            l.EntryDefaultsAsync(id, date ?? clock.Today, ct));
        g.MapPost("/", async (EquipmentInput input, EquipmentService s, CancellationToken ct) => Results.Ok(new { id = await s.CreateAsync(input, ct) }));
        g.MapPut("/{id:int}", async (int id, EquipmentInput input, EquipmentService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(id, input, ct);
            return Results.NoContent();
        });
        g.MapPost("/{id:int}/status", async (int id, StatusChangeInput input, EquipmentService s, CancellationToken ct) =>
        {
            await s.ChangeStatusAsync(id, input, ct);
            return Results.NoContent();
        });
        g.MapGet("/{id:int}/status-history", (int id, EquipmentService s, CancellationToken ct) => s.StatusHistoryAsync(id, ct));

        g.MapGet("/{id:int}/meter-readings", (int id, MeterReadingService s, CancellationToken ct) => s.ListAsync(id, ct));
        g.MapPost("/{id:int}/meter-readings", (int id, ManualMeterReadingInput input, MeterReadingService s, CancellationToken ct) =>
            s.AddManualAsync(id, input, ct));

        g.MapPost("/{id:int}/images", async (int id, IFormFile file, bool? setMain, EquipmentService s, CancellationToken ct) =>
        {
            await using var stream = file.OpenReadStream();
            return Results.Ok(new { id = await s.AddImageAsync(id, stream, file.FileName, file.ContentType, setMain ?? false, ct) });
        }).DisableAntiforgery();
        g.MapPut("/{id:int}/images/{attachmentId:int}/main", async (int id, int attachmentId, EquipmentService s, CancellationToken ct) =>
        {
            await s.SetMainImageAsync(id, attachmentId, ct);
            return Results.NoContent();
        });
        g.MapDelete("/{id:int}/images/{attachmentId:int}", async (int id, int attachmentId, EquipmentService s, CancellationToken ct) =>
        {
            await s.RemoveImageAsync(id, attachmentId, ct);
            return Results.NoContent();
        });

        g.MapPost("/{id:int}/transfer", async (int id, TransferInput input, AssignmentService s, CancellationToken ct) =>
            Results.Ok(new { id = await s.TransferAsync(id, input, ct) }));
        g.MapGet("/{id:int}/assignments", (int id, AssignmentService s, CancellationToken ct) => s.HistoryAsync(id, null, false, ct));

        g.MapPost("/{id:int}/rental-contracts", async (int id, RentalContractInput input, RentalContractService s, CancellationToken ct) =>
            Results.Ok(new { id = await s.CreateAsync(id, input, ct) }));
        g.MapPut("/rental-contracts/{contractId:int}", async (int contractId, RentalContractInput input, RentalContractService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(contractId, input, ct);
            return Results.NoContent();
        });
        g.MapDelete("/rental-contracts/{contractId:int}", async (int contractId, string? reason, RentalContractService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(contractId, reason, ct);
            return Results.NoContent();
        });

        g.MapGet("/{id:int}/depreciation-schedule", (int id, DepreciationService s, CancellationToken ct) => s.ScheduleAsync(id, ct));
        g.MapGet("/{id:int}/fuel-consumption", (int id, DateOnly? from, DateOnly? to, FuelService s, CancellationToken ct) =>
            s.ConsumptionAsync(id, from, to, ct));
        g.MapGet("/{id:int}/maintenance-reminders", (int id, MaintenanceService s, CancellationToken ct) => s.RemindersAsync(id, false, ct));
        g.MapGet("/{id:int}/costs", async (int id, DateOnly? from, DateOnly? to, CostQueryService s, CancellationToken ct) =>
        {
            var f = new CostFilter { EquipmentId = id, From = from, To = to };
            return Results.Ok(new
            {
                totals = await s.TotalsAsync(f, ct),
                byCategory = await s.ByCategoryAsync(f, ct),
                byProject = await s.ByProjectAsync(f, ct),
                byMonth = await s.ByMonthAsync(f, ct),
            });
        });
    }

    private static void MapAssignments(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/assignments").WithTags("Assignments");
        g.MapGet("/transfers", ([AsParameters] TransferQuery q, AssignmentService s, CancellationToken ct) => s.TransfersAsync(q, ct));
        g.MapGet("/active", (AssignmentService s, CancellationToken ct) => s.HistoryAsync(null, null, true, ct));
        g.MapGet("/drivers", ([AsParameters] DriverAssignmentQuery q, AssignmentService s, CancellationToken ct) => s.DriverAssignmentsAsync(q, ct));
        g.MapPost("/drivers", async (DriverAssignInput input, AssignmentService s, CancellationToken ct) =>
            Results.Ok(new { id = await s.AssignDriverAsync(input, ct) }));
        g.MapPost("/drivers/{id:int}/end", async (int id, EndAssignmentInput input, AssignmentService s, CancellationToken ct) =>
        {
            await s.EndDriverAssignmentAsync(id, input, ct);
            return Results.NoContent();
        });
        g.MapPost("/drivers/{id:int}/replace", async (int id, DriverReplaceInput input, AssignmentService s, CancellationToken ct) =>
            Results.Ok(new { id = await s.ReplaceDriverAsync(id, input, ct) }));
    }

    private static void MapDrivers(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/drivers").WithTags("Drivers");
        g.MapGet("/", async ([AsParameters] DriverQuery q, DriverService s, SettingsService settings, CancellationToken ct) =>
            await s.ListAsync(q, (await settings.GetEntityAsync(ct)).LicenseExpiryWarningDays, ct));
        g.MapGet("/{id:int}", (int id, DriverService s, CancellationToken ct) => s.GetAsync(id, ct));
        g.MapPost("/", async (DriverInput input, DriverService s, CancellationToken ct) => Results.Ok(new { id = await s.CreateAsync(input, ct) }));
        g.MapPut("/{id:int}", async (int id, DriverInput input, DriverService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(id, input, ct);
            return Results.NoContent();
        });
        g.MapPut("/{id:int}/active", async (int id, ActiveInput input, DriverService s, CancellationToken ct) =>
        {
            await s.SetActiveAsync(id, input.IsActive, ct);
            return Results.NoContent();
        });
        g.MapPost("/{id:int}/photo", async (int id, IFormFile file, DriverService s, CancellationToken ct) =>
        {
            await using var stream = file.OpenReadStream();
            return Results.Ok(new { id = await s.SetPhotoAsync(id, stream, file.FileName, file.ContentType, ct) });
        }).DisableAntiforgery();
    }
}

public record ProjectStatusInput(ProjectStatus Status);

public record ActiveInput(bool IsActive);
