import { prisma } from "@junglebob/db";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/features/auth/current-user";
import {
  defaultFoodPreference,
  saveFoodPreference,
  type FoodPreferenceInput
} from "@/features/food-profile/profile";

export async function GET() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const preference = await prisma.foodPreference.findUnique({
    where: { userId: user.id },
    select: {
      allergyFoods: true,
      favoriteFoods: true,
      dislikedFoods: true,
      spicyTolerance: true
    }
  });

  return NextResponse.json({
    preference: preference ?? defaultFoodPreference()
  });
}

export async function PUT(request: Request) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const input = (await request.json()) as FoodPreferenceInput;
    const preference = await saveFoodPreference(user.id, input, {
      upsertPreference: (userId, data) =>
        prisma.foodPreference.upsert({
          where: { userId },
          create: {
            userId,
            ...data
          },
          update: data,
          select: {
            userId: true,
            allergyFoods: true,
            favoriteFoods: true,
            dislikedFoods: true,
            spicyTolerance: true
          }
        })
    });

    return NextResponse.json({ preference });
  } catch (error) {
    const message = error instanceof Error ? error.message : "food preference update failed";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
