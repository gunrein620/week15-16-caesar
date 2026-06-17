import process from "node:process";
import { prisma } from "@junglebob/db";
import { requireMaintenanceConfirmation } from "./maintenance-guard.ts";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // DATABASE_URL may already be provided by the runtime.
}

const weeklyImageWhere = {
  OR: [{ sourceId: { startsWith: "weekly:" } }, { imageType: "WEEKLY_SHEET" as const }]
};

try {
  requireMaintenanceConfirmation(process.argv, "clear-weekly-images");

  const target = await prisma.menuArchive.findMany({
    where: weeklyImageWhere,
    select: {
      date: true,
      id: true,
      imageType: true,
      imageUrl: true,
      mealType: true,
      sourceId: true
    },
    orderBy: [{ date: "asc" }, { mealType: "asc" }]
  });

  console.log(`weekly menu sheet cleanup target: ${target.length}`);
  for (const row of target) {
    console.log(
      [
        new Date(row.date).toISOString().slice(0, 10),
        row.mealType,
        row.imageType,
        row.sourceId ?? "no-source",
        row.imageUrl ? "has-image" : "no-image"
      ].join(" | ")
    );
  }

  const result = await prisma.menuArchive.updateMany({
    where: weeklyImageWhere,
    data: {
      imageHash: null,
      imageType: "NONE",
      imageUrl: null
    }
  });

  console.log(`weekly menu sheet cleanup complete: ${result.count}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
