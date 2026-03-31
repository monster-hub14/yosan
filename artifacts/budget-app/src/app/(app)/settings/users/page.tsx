import { Metadata } from "next";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRound, Shield } from "lucide-react";
import { UserAIControlButton } from "./user-ai-controls";
import { CreateUserButton } from "./create-user-button";

export const metadata: Metadata = {
  title: "Users | Settings | Yosan AI",
};

export default async function UsersPage() {
  const session = await getSession();

  if (!session || session.role !== "ADMIN") {
    redirect("/settings/account");
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      aiControl: { select: { id: true } },
      _count: { select: { ownedBudgets: true } },
    },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="border-border">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Manage who has access to this instance. {users.length} user
              {users.length !== 1 ? "s" : ""} registered.
            </CardDescription>
          </div>
          <CreateUserButton />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Budgets</TableHead>
                <TableHead>AI</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                        <UserRound className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <span className="font-medium text-sm">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    {user.role === "ADMIN" ? (
                      <Badge className="gap-1 text-xs">
                        <Shield className="w-3 h-3" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        User
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user._count.ownedBudgets}
                  </TableCell>
                  <TableCell>
                    <UserAIControlButton
                      user={{
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        hasOverride: user.aiControl != null,
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
