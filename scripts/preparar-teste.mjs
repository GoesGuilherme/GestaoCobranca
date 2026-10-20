import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";

const base = process.env.TEST_DATABASE_URL
  ?? process.env.DIRECT_URL
  ?? process.env.DATABASE_URL;

if (!base) {
  console.error("Defina DATABASE_URL no arquivo .env antes de rodar os testes.");
  process.exit(1);
}

const urlTeste = new URL(base);
urlTeste.pathname = "/gestaocobranca_test";
const destino = urlTeste.toString();

if (!destino.includes("/gestaocobranca_test")) {
  console.error("Recusando preparar um banco que não seja gestaocobranca_test.");
  process.exit(1);
}

const admin = new pg.Client({ connectionString: base });
await admin.connect();
const existente = await admin.query(
  "SELECT 1 FROM pg_database WHERE datname = 'gestaocobranca_test'",
);
if (existente.rowCount === 0) {
  await admin.query("CREATE DATABASE gestaocobranca_test");
}
await admin.end();

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: destino,
    DIRECT_URL: destino,
  },
});
