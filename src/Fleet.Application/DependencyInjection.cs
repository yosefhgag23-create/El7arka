using Fleet.Application.Assignments;
using Fleet.Application.Attachments;
using Fleet.Application.Common;
using Fleet.Application.Costs;
using Fleet.Application.Dashboard;
using Fleet.Application.Depreciation;
using Fleet.Application.Drivers;
using Fleet.Application.Equipments;
using Fleet.Application.Expenses;
using Fleet.Application.Fuel;
using Fleet.Application.Maintenance;
using Fleet.Application.Overtime;
using Fleet.Application.Projects;
using Fleet.Application.Reports;
using Fleet.Application.Settings;
using Fleet.Application.Users;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace Fleet.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        ValidatorOptions.Global.LanguageManager.Culture = new System.Globalization.CultureInfo("ar");
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, ServiceLifetime.Singleton);

        services.AddScoped<MeterReadingService>();
        services.AddScoped<AssignmentLookup>();
        services.AddScoped<LedgerService>();
        services.AddScoped<LookupService>();
        services.AddScoped<SettingsService>();
        services.AddScoped<ProjectService>();
        services.AddScoped<EquipmentService>();
        services.AddScoped<RentalContractService>();
        services.AddScoped<RentalAccrualService>();
        services.AddScoped<AssignmentService>();
        services.AddScoped<DriverService>();
        services.AddScoped<FuelService>();
        services.AddScoped<MaintenanceService>();
        services.AddScoped<OvertimeService>();
        services.AddScoped<ExpenseService>();
        services.AddScoped<DepreciationService>();
        services.AddScoped<CostQueryService>();
        services.AddScoped<UserService>();
        services.AddScoped<AttachmentService>();
        services.AddScoped<DashboardService>();
        services.AddScoped<ReportService>();
        return services;
    }
}
