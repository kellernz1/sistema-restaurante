import { describe, expect, it } from "vitest";
import spanish from "./es.json";
import { createTranslator, normalizeLocale, translate } from "./catalog";

describe("interface language", () => {
  it("accepts only the two supported locales and defaults to Brazilian Portuguese", () => {
    expect(normalizeLocale("es")).toBe("es");
    for (const value of [undefined, null, "pt-BR", "en", "<script>"]) expect(normalizeLocale(value)).toBe("pt-BR");
  });
  it("translates labels, validation errors, and status messages", () => {
    const t = createTranslator("es");
    expect(t("Senha")).toBe("Contraseña");
    expect(t("Informe um e-mail válido.")).toBe("Ingrese un correo electrónico válido.");
    expect(t("Aguardando confirmação")).toBe("Pendiente de confirmación");
    expect(t("Não foi possível carregar o cardápio.")).toBe("No se pudo cargar el menú.");
  });
  it("preserves names, notes, prices, nulls and other application data", () => {
    for (const value of ["Milanesa de la casa", "Ana Gómez", "Sin cebolla", "R$ 25,00", null, 12, false]) {
      expect(translate("es", value)).toBe(value);
    }
  });
  it("preserves spacing around inline text", () => {
    expect(translate("es", " Seu carrinho ")).toBe(" Su carrito ");
  });
  it("translates dynamic prompts without changing interpolated data", () => {
    expect(translate("es", "Adicionar Milanesa de la casa")).toBe("Agregar Milanesa de la casa");
    expect(translate("es", "Pedido enviado! Comanda #42. Acompanhe os itens abaixo.")).toBe("¡Pedido enviado! Comanda #42. Siga los artículos abajo.");
    expect(translate("es", "Mesa 3, Ocupada, capacidade para 4 pessoas")).toBe("Mesa 3, Ocupada, capacidad para 4 personas");
  });
  it("restores messages already in state when switching back to Portuguese", () => {
    expect(translate("pt-BR", translate("es", "Informe um e-mail válido."))).toBe("Informe um e-mail válido.");
    expect(translate("pt-BR", "Agregar Milanesa de la casa")).toBe("Adicionar Milanesa de la casa");
  });
  it("provides nonempty translations with matching interpolation placeholders", () => {
    for (const [source, target] of Object.entries(spanish)) {
      expect(target.trim(), source).not.toBe("");
      expect(target.match(/\{\d+\}/g) ?? [], source).toEqual(source.match(/\{\d+\}/g) ?? []);
    }
  });
});
