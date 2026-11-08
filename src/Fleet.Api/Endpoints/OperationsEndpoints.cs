using Fleet.Application.Costs;
using Fleet.Application.Dashboard;
using Fleet.Application.Depreciation;
using Fleet.Application.Expenses;
using Fleet.Application.Fuel;
using Fleet.Application.Maintenance;
using Fleet.Application.Overtime;

namespace Fleet.Api.Endpoints;

public static class OperationsEndpoints
{
    public static void MapOperations(this IEndpointRouteBuilder app)
    {
        var fuel = app.MapGroup("/api/fuel").WithTags("Fuel");
        fuel.MapGet("/", ([AsParameters] FuelQuery q, FuelService s, CancellationToken ct) => s.ListAsync(q, ct));
        fuel.MapGet("/{id:int}", (int id, FuelService s, CancellationToken ct) => s.GetAsync(id, ct));
        fuel.MapPost("/", async (FuelInput input, FuelService s, CancellationToken ct) => Results.Ok(new { id = await s.CreateAsync(input, ct) }));
        fuel.MapPut("/{id:int}", async (int id, FuelInput input, FuelService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(id, input, ct);
            return Results.NoContent();
        });
        fuel.MapDelete("/{id:int}", async (int id, string? reason, FuelService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, reason, ct);
            return Results.NoContent();
        });
        fuel.MapGet("/consumption", ([AsParameters] FuelQuery q, FuelService s, CancellationToken ct) => s.ConsumptionReportAsync(q, ct));

        var m = app.MapGroup("/api/maintenance").WithTags("Maintenance");
        m.MapGet("/", ([AsParameters] MaintenanceQuery q, MaintenanceService s, CancellationToken ct) => s.ListAsync(q, ct));
        m.MapGet("/{id:int}", (int id, MaintenanceService s, CancellationToken ct) => s.GetAsync(id, ct));
        m.MapPost("/", async (MaintenanceInput input, MaintenanceService s, CancellationToken ct) => Results.Ok(new { id = await s.CreateAsync(input, ct) }));
        m.MapPut("/{id:int}", async (int id, MaintenanceInput input, MaintenanceService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(id, input, ct);
            return Results.NoContent();
        });
        m.MapDelete("/{id:int}", async (int id, string? reason, MaintenanceService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, reason, ct);
            return Results.NoContent();
        });
        m.MapGet("/reminders", (bool? dueOnly, MaintenanceService s, CancellationToken ct) => s.RemindersAsync(null, dueOnly ?? false, ct));
        m.MapGet("/plans", (int? equipmentId, MaintenanceService s, CancellationToken ct) => s.PlansAsync(equipmentId, ct));
        m.MapPost("/plans", async (MaintenancePlanInput input, MaintenanceService s, CancellationToken ct) =>
            Results.Ok(new { id = await s.SavePlanAsync(null, input, ct) }));
        m.MapPut("/plans/{id:int}", async (int id, MaintenancePlanInput input, MaintenanceService s, CancellationToken ct) =>
        {
            await s.SavePlanAsync(id, input, ct);
            return Results.NoContent();
        });
        m.MapDelete("/plans/{id:int}", async (int id, MaintenanceService s, CancellationToken ct) =>
        {
            await s.DeletePlanAsync(id, ct);
            return Results.NoContent();
        });

        var o = app.MapGroup("/api/overtime").WithTags("Overtime");
        o.MapGet("/", ([AsParameters] OvertimeQuery q, OvertimeService s, CancellationToken ct) => s.ListAsync(q, ct));
        o.MapGet("/{id:int}", (int id, OvertimeService s, CancellationToken ct) => s.GetAsync(id, ct));
        o.MapPost("/", async (OvertimeInput input, OvertimeService s, CancellationToken ct) => Results.Ok(new { id = await s.CreateAsync(input, ct) }));
        o.MapPut("/{id:int}", async (int id, OvertimeInput input, OvertimeService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(id, input, ct);
            return Results.NoContent();
        });
        o.MapPut("/{id:int}/approval", async (int id, ApprovalInput input, OvertimeService s, CancellationToken ct) =>
        {
            await s.SetApprovalAsync(id, input.Status, ct);
            return Results.NoContent();
        });
        o.MapDelete("/{id:int}", async (int id, string? reason, OvertimeService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, reason, ct);
            return Results.NoContent();
        });
        o.MapGet("/resolve-rate", async (int driverId, DateOnly date, OvertimeService s, CancellationToken ct) =>
            Results.Ok(new { rate = await s.ResolveRateAsync(driverId, date, ct) }));
        o.MapGet("/rates", (OvertimeService s, CancellationToken ct) => s.RatesAsync(ct));
        o.MapPost("/rates", async (OvertimeRateInput input, OvertimeService s, CancellationToken ct) =>
            Results.Ok(new { id = await s.SaveRateAsync(null, input, ct) }));
        o.MapPut("/rates/{id:int}", async (int id, OvertimeRateInput input, OvertimeService s, CancellationToken ct) =>
        {
            await s.SaveRateAsync(id, input, ct);
            return Results.NoContent();
        });
        o.MapDelete("/rates/{id:int}", async (int id, OvertimeService s, CancellationToken ct) =>
        {
            await s.DeleteRateAsync(id, ct);
            return Results.NoContent();
        });

        var e = app.MapGroup("/api/expenses").WithTags("Expenses");
        e.MapGet("/", ([AsParameters] ExpenseQuery q, ExpenseService s, CancellationToken ct) => s.ListAsync(q, ct));
        e.MapGet("/{id:int}", (int id, ExpenseService s, CancellationToken ct) => s.GetAsync(id, ct));
        e.MapPost("/", async (ExpenseInput input, ExpenseService s, CancellationToken ct) => Results.Ok(new { id = await s.CreateAsync(input, ct) }));
        e.MapPut("/{id:int}", async (int id, ExpenseInput input, ExpenseService s, CancellationToken ct) =>
        {
            await s.UpdateAsync(id, input, ct);
            return Results.NoContent();
        });
        e.MapDelete("/{id:int}", async (int id, string? reason, ExpenseService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, reason, ct);
            return Results.NoContent();
        });

        var d = app.MapGroup("/api/depreciation").WithTags("Depreciation");
        d.MapGet("/", ([AsParameters] DepreciationQuery q, DepreciationService s, CancellationToken ct) => s.ListAsync(q, ct));

        app.MapGet("/api/dashboard", (DateOnly? from, DateOnly? to, DashboardService s, CancellationToken ct) => s.GetAsync(from, to, ct))
            .WithTags("Dashboard");

        var c = app.MapGroup("/api/costs").WithTags("Costs");
        c.MapGet("/totals", ([AsParameters] CostFilter f, CostQueryService s, CancellationToken ct) => s.TotalsAsync(f, ct));
        c.MapGet("/by-project", ([AsParameters] CostFilter f, CostQueryService s, CancellationToken ct) => s.ByProjectAsync(f, ct));
        c.MapGet("/by-equipment", ([AsParameters] CostFilter f, CostQueryService s, CancellationToken ct) => s.ByEquipmentAsync(f, ct));
        c.MapGet("/by-category", ([AsParameters] CostFilter f, CostQueryService s, CancellationToken ct) => s.ByCategoryAsync(f, ct));
        c.MapGet("/by-month", ([AsParameters] CostFilter f, CostQueryService s, CancellationToken ct) => s.ByMonthAsync(f, ct));
    }
}
