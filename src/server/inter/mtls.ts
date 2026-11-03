import https from "node:https";
import { ErroAplicacao } from "@/server/erros";

export type RespostaHttp = { status: number; body: string };

export type PedidoHttp = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  cert: string;
  key: string;
};

const TEMPO_MS = 20_000;

export function requisicaoMtls(pedido: PedidoHttp): Promise<RespostaHttp> {
  return new Promise((resolve, reject) => {
    let alvo: URL;
    try {
      alvo = new URL(pedido.url);
    } catch {
      reject(new ErroAplicacao("Endereço do Banco Inter inválido.", 500, "inter_url"));
      return;
    }
    if (alvo.protocol !== "https:") {
      reject(new ErroAplicacao("O Banco Inter só aceita HTTPS.", 500, "inter_url"));
      return;
    }
    const req = https.request(
      {
        protocol: alvo.protocol,
        hostname: alvo.hostname,
        port: alvo.port || 443,
        path: `${alvo.pathname}${alvo.search}`,
        method: pedido.method,
        cert: pedido.cert,
        key: pedido.key,
        headers: pedido.headers,
        timeout: TEMPO_MS,
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (pedaço: Buffer) => partes.push(pedaço));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(partes).toString("utf8") });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new ErroAplicacao("O Banco Inter não respondeu a tempo.", 504, "inter_timeout"));
    });
    req.on("error", () => {
      reject(new ErroAplicacao("Não foi possível falar com o Banco Inter.", 502, "inter_rede"));
    });
    if (pedido.body) req.write(pedido.body);
    req.end();
  });
}
