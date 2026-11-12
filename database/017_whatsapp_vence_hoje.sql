-- Espelha prisma/migrations/20261112143000_whatsapp_vence_hoje.
-- Não aplicar em produção por este arquivo. A fonte da verdade é o Prisma Migrate.
-- Só acrescenta o tipo VENCE_HOJE. Não cria subconta e não envia mensagem.

ALTER TABLE "templates_whatsapp" DROP CONSTRAINT "templates_whatsapp_tipo_check";

ALTER TABLE "templates_whatsapp" ADD CONSTRAINT "templates_whatsapp_tipo_check" CHECK ("tipo" IN ('BOLETO_GERADO', 'VENCE_EM_DIAS', 'VENCE_HOJE', 'VENCEU', 'PAGO'));

ALTER TABLE "fila_whatsapp" DROP CONSTRAINT "fila_whatsapp_tipo_check";

ALTER TABLE "fila_whatsapp" ADD CONSTRAINT "fila_whatsapp_tipo_check" CHECK ("tipo" IN ('BOLETO_GERADO', 'VENCE_EM_DIAS', 'VENCE_HOJE', 'VENCEU', 'PAGO'));
