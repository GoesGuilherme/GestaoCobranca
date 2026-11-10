import { describe, expect, it } from "vitest";
import {
  documentoDaFatura,
  lerMensagemDownload,
  MENSAGEM_DOWNLOAD_FALHOU,
  MENSAGEM_FATURA_SEM_DOCUMENTO,
  mensagemDaRespostaDownload,
  NOME_ARQUIVO_FATURA,
} from "./baixar-fatura";

const ID = "clh3fatura0123456789abcd";

describe("documento da fatura para download", () => {
  it("usa o PDF do boleto que o Asaas e a Cora já devolvem", () => {
    const asaas = documentoDaFatura({ boletoUrl: " https://sandbox.asaas.com/b/pdf/pay_1 " });
    const cora = documentoDaFatura({ boletoUrl: "https://api.stage.cora.com.br/boletos/exemplo.pdf" });

    expect(asaas).toEqual({
      disponivel: true,
      href: "https://sandbox.asaas.com/b/pdf/pay_1",
      nomeArquivo: NOME_ARQUIVO_FATURA,
      origem: "provedor",
    });
    expect(cora).toMatchObject({
      disponivel: true,
      href: "https://api.stage.cora.com.br/boletos/exemplo.pdf",
      origem: "provedor",
    });
  });

  it("reaproveita a rota de PDF do Inter, inclusive quando a URL pública já foi gravada", () => {
    const relativa = documentoDaFatura({ boletoUrl: `/api/faturas/${ID}/pdf` });
    const absoluta = documentoDaFatura({
      boletoUrl: `https://cobrancas.exemplo.test/api/faturas/${ID}/pdf?origem=link`,
    });

    expect(relativa).toEqual({
      disponivel: true,
      href: `/api/faturas/${ID}/pdf`,
      nomeArquivo: NOME_ARQUIVO_FATURA,
      origem: "aplicacao",
    });
    expect(absoluta).toMatchObject({
      disponivel: true,
      href: `/api/faturas/${ID}/pdf`,
      origem: "aplicacao",
    });
  });

  it("não oferece download quando a fatura ainda não tem documento", () => {
    expect(documentoDaFatura({ boletoUrl: null })).toEqual({
      disponivel: false,
      mensagem: MENSAGEM_FATURA_SEM_DOCUMENTO,
    });
    expect(documentoDaFatura({ boletoUrl: "   " })).toEqual({
      disponivel: false,
      mensagem: MENSAGEM_FATURA_SEM_DOCUMENTO,
    });
  });

  it("recusa endereço que não é o PDF do boleto nem a rota da aplicação", () => {
    const recusados = [
      "javascript:alert(1)",
      "data:application/pdf;base64,JVBERi0=",
      "http://sandbox.asaas.com/b/pdf/pay_1",
      "https://usuario:segredo@sandbox.asaas.com/b/pdf/pay_1",
      "//evil.test/boleto.pdf",
      `/api/faturas/${ID}/pdf/extra`,
      "/api/faturas/../admin/pdf",
      "não é url",
    ];

    for (const boletoUrl of recusados) {
      expect(documentoDaFatura({ boletoUrl }), boletoUrl).toEqual({
        disponivel: false,
        mensagem: MENSAGEM_FATURA_SEM_DOCUMENTO,
      });
    }
  });
});

describe("resposta do PDF", () => {
  it("segue o download quando a rota devolve o PDF", () => {
    expect(
      mensagemDaRespostaDownload({
        ok: true,
        contentType: "application/pdf",
        corpo: "%PDF",
      }),
    ).toBeNull();
  });

  it("mostra a mensagem da API quando o documento não está disponível", async () => {
    const naoEncontrado = new Response(JSON.stringify({ erro: "Boleto não encontrado.", codigo: "nao_encontrado" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
    const semPdf = new Response(
      JSON.stringify({ erro: "Este banco não entrega o PDF do boleto.", codigo: "pdf_indisponivel" }),
      { status: 422, headers: { "content-type": "application/json" } },
    );

    expect(await lerMensagemDownload(naoEncontrado)).toBe("Boleto não encontrado.");
    expect(await lerMensagemDownload(semPdf)).toBe("Este banco não entrega o PDF do boleto.");
  });

  it("não usa o corpo cru quando a resposta não é a mensagem da API", () => {
    expect(
      mensagemDaRespostaDownload({
        ok: false,
        contentType: "text/html",
        corpo: "<html>erro</html>",
      }),
    ).toBe(MENSAGEM_DOWNLOAD_FALHOU);
    expect(
      mensagemDaRespostaDownload({
        ok: false,
        contentType: "application/json",
        corpo: JSON.stringify({ erro: "   " }),
      }),
    ).toBe(MENSAGEM_DOWNLOAD_FALHOU);
  });

  it("não consome o corpo de um PDF válido", async () => {
    const pdf = new Response(Uint8Array.from([37, 80, 68, 70]), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });

    expect(await lerMensagemDownload(pdf)).toBeNull();
    expect(new TextDecoder().decode(await pdf.arrayBuffer())).toBe("%PDF");
  });
});
