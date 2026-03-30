export interface SessionPayload {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
  name: string;
}
