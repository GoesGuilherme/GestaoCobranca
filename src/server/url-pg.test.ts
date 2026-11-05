import { describe, expect, it } from "vitest";
import { urlParaPg } from "./url-pg";

describe("url do pooler", () => {
  it("remove pgbouncer=true e preserva sslmode", () => {
    const limpa = urlParaPg(
      "postgresql://postgres.ref:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&connection_limit=1",
    );
    const url = new URL(limpa);
    expect(url.port).toBe("6543");
    expect(url.searchParams.get("pgbouncer")).toBeNull();
    expect(url.searchParams.get("connection_limit")).toBeNull();
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.username).toBe("postgres.ref");
    expect(url.searchParams.get("options")).toBeNull();
  });

  it("só pede o papel da aplicação quando o operador liga a variável", () => {
    const limpa = urlParaPg("postgresql://gestao:gestao@127.0.0.1:5432/gestaocobranca", {
      NODE_ENV: "test",
      TAGUARO_DB_PAPEL: "taguaro_app",
    });
    expect(new URL(limpa).searchParams.get("options")).toBe("-c role=taguaro_app");
  });
});
