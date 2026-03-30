import { PrismaClient } from "@prisma/client";

export const TOP_LEVEL_CATEGORIES = [
  { name: "Housing", color: "#6366f1", icon: "home", sortOrder: 0 },
  { name: "Food & Dining", color: "#f59e0b", icon: "utensils", sortOrder: 1 },
  { name: "Transportation", color: "#3b82f6", icon: "car", sortOrder: 2 },
  { name: "Healthcare", color: "#ef4444", icon: "heart-pulse", sortOrder: 3 },
  { name: "Recreation", color: "#8b5cf6", icon: "waves", sortOrder: 4 },
  { name: "Shopping", color: "#ec4899", icon: "shopping-bag", sortOrder: 5 },
  { name: "Utilities", color: "#14b8a6", icon: "zap", sortOrder: 6 },
  { name: "Subscriptions", color: "#f97316", icon: "repeat", sortOrder: 7 },
  { name: "Personal Care", color: "#84cc16", icon: "sparkles", sortOrder: 8 },
  { name: "Education", color: "#0ea5e9", icon: "graduation-cap", sortOrder: 9 },
  { name: "Other", color: "#6b7280", icon: "circle-dot", sortOrder: 10 },
] as const;

export const SUBCATEGORIES: Array<{ parent: string; name: string; icon?: string; sortOrder?: number }> = [
  // Housing
  { parent: "Housing", name: "Rent / Mortgage", icon: "building", sortOrder: 0 },
  { parent: "Housing", name: "Insurance (Home)", icon: "shield", sortOrder: 1 },
  { parent: "Housing", name: "Maintenance & Repairs", icon: "wrench", sortOrder: 2 },
  { parent: "Housing", name: "Furnishings", icon: "sofa", sortOrder: 3 },
  // Food & Dining
  { parent: "Food & Dining", name: "Groceries", icon: "shopping-cart", sortOrder: 0 },
  { parent: "Food & Dining", name: "Restaurants", icon: "fork-knife", sortOrder: 1 },
  { parent: "Food & Dining", name: "Coffee & Cafes", icon: "coffee", sortOrder: 2 },
  { parent: "Food & Dining", name: "Takeout & Delivery", icon: "package", sortOrder: 3 },
  // Transportation
  { parent: "Transportation", name: "Fuel", icon: "fuel", sortOrder: 0 },
  { parent: "Transportation", name: "Vehicle Maintenance", icon: "wrench", sortOrder: 1 },
  { parent: "Transportation", name: "Insurance (Auto)", icon: "shield", sortOrder: 2 },
  { parent: "Transportation", name: "Public Transit", icon: "bus", sortOrder: 3 },
  { parent: "Transportation", name: "Parking & Tolls", icon: "parking-circle", sortOrder: 4 },
  { parent: "Transportation", name: "Rideshare", icon: "car-taxi-front", sortOrder: 5 },
  // Healthcare
  { parent: "Healthcare", name: "Doctor Visits", icon: "stethoscope", sortOrder: 0 },
  { parent: "Healthcare", name: "Prescriptions", icon: "pill", sortOrder: 1 },
  { parent: "Healthcare", name: "Dental", icon: "smile", sortOrder: 2 },
  { parent: "Healthcare", name: "Vision", icon: "eye", sortOrder: 3 },
  { parent: "Healthcare", name: "Insurance (Health)", icon: "shield", sortOrder: 4 },
  // Recreation
  { parent: "Recreation", name: "Fishing & Boating", icon: "anchor", sortOrder: 0 },
  { parent: "Recreation", name: "Hiking & Camping", icon: "tent", sortOrder: 1 },
  { parent: "Recreation", name: "Sports & Fitness", icon: "dumbbell", sortOrder: 2 },
  { parent: "Recreation", name: "Hobbies", icon: "palette", sortOrder: 3 },
  { parent: "Recreation", name: "Travel & Vacations", icon: "plane", sortOrder: 4 },
  { parent: "Recreation", name: "Movies & Shows", icon: "film", sortOrder: 5 },
  // Shopping
  { parent: "Shopping", name: "Clothing & Apparel", icon: "shirt", sortOrder: 0 },
  { parent: "Shopping", name: "Electronics", icon: "smartphone", sortOrder: 1 },
  { parent: "Shopping", name: "Household Supplies", icon: "package", sortOrder: 2 },
  { parent: "Shopping", name: "Gifts", icon: "gift", sortOrder: 3 },
  // Utilities
  { parent: "Utilities", name: "Electric", icon: "zap", sortOrder: 0 },
  { parent: "Utilities", name: "Gas (Home)", icon: "flame", sortOrder: 1 },
  { parent: "Utilities", name: "Water & Sewage", icon: "droplets", sortOrder: 2 },
  { parent: "Utilities", name: "Internet", icon: "wifi", sortOrder: 3 },
  { parent: "Utilities", name: "Phone", icon: "phone", sortOrder: 4 },
  // Subscriptions
  { parent: "Subscriptions", name: "Streaming (Video)", icon: "tv", sortOrder: 0 },
  { parent: "Subscriptions", name: "Streaming (Music)", icon: "music", sortOrder: 1 },
  { parent: "Subscriptions", name: "Software & Apps", icon: "app-window", sortOrder: 2 },
  { parent: "Subscriptions", name: "Memberships", icon: "badge-check", sortOrder: 3 },
  // Personal Care
  { parent: "Personal Care", name: "Hair & Grooming", icon: "scissors", sortOrder: 0 },
  { parent: "Personal Care", name: "Skincare & Cosmetics", icon: "sparkles", sortOrder: 1 },
  { parent: "Personal Care", name: "Gym", icon: "dumbbell", sortOrder: 2 },
  // Education
  { parent: "Education", name: "Tuition & Courses", icon: "graduation-cap", sortOrder: 0 },
  { parent: "Education", name: "Books & Supplies", icon: "book-open", sortOrder: 1 },
  { parent: "Education", name: "Childcare", icon: "baby", sortOrder: 2 },
];

export async function seedDefaultCategories(db: PrismaClient, budgetId: string) {
  const topCats: Record<string, string> = {};

  for (const cat of TOP_LEVEL_CATEGORIES) {
    const created = await db.category.create({
      data: {
        budgetId,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        isDefault: true,
        sortOrder: cat.sortOrder,
      },
    });
    topCats[cat.name] = created.id;
  }

  for (const sub of SUBCATEGORIES) {
    const parentId = topCats[sub.parent];
    if (!parentId) continue;
    const parentColor = TOP_LEVEL_CATEGORIES.find((c) => c.name === sub.parent)?.color ?? "#6b7280";
    await db.category.create({
      data: {
        budgetId,
        name: sub.name,
        color: parentColor,
        icon: sub.icon,
        isDefault: true,
        parentId,
        sortOrder: sub.sortOrder ?? 0,
      },
    });
  }

  return topCats;
}
