using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Fleet.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EquipmentLicense : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LicenseAttachmentId",
                table: "Equipment",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "LicenseExpiryDate",
                table: "Equipment",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LicenseNumber",
                table: "Equipment",
                type: "TEXT",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Equipment_LicenseExpiryDate",
                table: "Equipment",
                column: "LicenseExpiryDate");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Equipment_LicenseExpiryDate",
                table: "Equipment");

            migrationBuilder.DropColumn(
                name: "LicenseAttachmentId",
                table: "Equipment");

            migrationBuilder.DropColumn(
                name: "LicenseExpiryDate",
                table: "Equipment");

            migrationBuilder.DropColumn(
                name: "LicenseNumber",
                table: "Equipment");
        }
    }
}
