import { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tag } from "lucide-react";

export const metadata: Metadata = {
  title: "Categories | Settings | Budget",
};

export default async function CategoriesPage() {
  const session = await getSession();

  const budget = session
    ? await db.budget.findFirst({
        where: {
          OR: [
            { ownerId: session.userId },
            { memberships: { some: { userId: session.userId } } },
          ],
        },
        include: {
          categories: {
            where: { parentId: null },
            orderBy: { name: "asc" },
          },
        },
      })
    : null;

  const categories = budget?.categories || [];

  return (
    <div className="space-y-6 max-w-xl">
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Tag className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>Expense Categories</CardTitle>
              <CardDescription>{categories.length} categories configured</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color || "#6b7280" }}
                  />
                  <span className="text-sm truncate">{cat.name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
