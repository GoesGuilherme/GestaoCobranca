-- Botão de promessa no modelo de WhatsApp da empresa.
-- Só acrescenta colunas. Não apaga dado e não muda modelo já gravado:
-- tem_botao nasce desligado e a promessa pelo WhatsApp nasce ligada.

ALTER TABLE "empresas"
  ADD COLUMN "promessa_whatsapp" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "templates_whatsapp"
  ADD COLUMN "tem_botao" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "templates_whatsapp"
  ADD COLUMN "corpo_enviado" TEXT;
