-- Acrescenta o tipo VENCE_HOJE aos modelos e à fila de WhatsApp.
-- Não apaga linha, não altera credencial e não envia mensagem.

ALTER TABLE "templates_whatsapp" DROP CONSTRAINT "templates_whatsapp_tipo_check";

ALTER TABLE "templates_whatsapp" ADD CONSTRAINT "templates_whatsapp_tipo_check" CHECK ("tipo" IN ('BOLETO_GERADO', 'VENCE_EM_DIAS', 'VENCE_HOJE', 'VENCEU', 'PAGO'));

ALTER TABLE "fila_whatsapp" DROP CONSTRAINT "fila_whatsapp_tipo_check";

ALTER TABLE "fila_whatsapp" ADD CONSTRAINT "fila_whatsapp_tipo_check" CHECK ("tipo" IN ('BOLETO_GERADO', 'VENCE_EM_DIAS', 'VENCE_HOJE', 'VENCEU', 'PAGO'));
