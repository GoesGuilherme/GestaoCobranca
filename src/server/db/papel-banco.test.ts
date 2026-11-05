import pg from "pg";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("papel taguaro_app", () => {
  it("não é superusuário, lê a aplicação e um papel sem grant não vê credencial", async () => {
    const sql = readFileSync("prisma/migrations/20261105160000_papel_banco_app/migration.sql", "utf8");
    expect(sql).not.toMatch(/force\s+row\s+level\s+security/i);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/alter\s+table\s+"faturas"/i);

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL ausente");
    const app = new pg.Client({ connectionString: url, options: "-c role=taguaro_app" });
    await app.connect();
    try {
      const papel = await app.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
        "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
      );
      expect(papel.rows[0]?.current_user).toBe("taguaro_app");
      expect(papel.rows[0]?.rolsuper).toBe(false);
      expect(papel.rows[0]?.rolbypassrls).toBe(false);
      await expect(app.query("SELECT count(*)::int AS total FROM empresas")).resolves.toBeTruthy();
    } finally {
      await app.end();
    }

    const dono = new pg.Client({ connectionString: url });
    await dono.connect();
    try {
      await dono.query("DROP ROLE IF EXISTS taguaro_teste_invasor");
      await dono.query("CREATE ROLE taguaro_teste_invasor NOLOGIN");
      await dono.query("GRANT USAGE ON SCHEMA public TO taguaro_teste_invasor");
      await dono.query("GRANT taguaro_teste_invasor TO CURRENT_USER");
      await dono.query("SET ROLE taguaro_teste_invasor");
      await expect(dono.query("SELECT 1 FROM configuracoes_pagamento")).rejects.toThrow(/permission denied/i);
    } finally {
      await dono.query("RESET ROLE");
      await dono.query("REVOKE ALL ON SCHEMA public FROM taguaro_teste_invasor");
      await dono.query("REVOKE taguaro_teste_invasor FROM CURRENT_USER");
      await dono.query("DROP ROLE IF EXISTS taguaro_teste_invasor");
      await dono.end();
    }
  });
});