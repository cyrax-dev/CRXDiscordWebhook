import { describe, expect, it } from "bun:test";

import { validateWebhookBody } from "../../src/api/webhooks.schema";

const SUPPRESS_EMBEDS = 4;
const SUPPRESS_NOTIFICATIONS = 4096;
const IS_COMPONENTS_V2 = 32768;

describe("validateWebhookBody", () => {
    it("отклоняет полностью пустое тело", () => {
        expect(validateWebhookBody({})).toBe("It is necessary to pass content, embeds, components, or a poll.");
    });

    it("не считает пустую строку контентом", () => {
        expect(validateWebhookBody({ content: "" })).not.toBeNull();
    });

    it("не считает пустые массивы содержимым", () => {
        expect(validateWebhookBody({ embeds: [] })).not.toBeNull();
        expect(validateWebhookBody({ components: [] })).not.toBeNull();
    });

    it("принимает любой из допустимых носителей содержимого", () => {
        expect(validateWebhookBody({ content: "hello" })).toBeNull();
        expect(validateWebhookBody({ embeds: [{ title: "x" }] })).toBeNull();
        expect(validateWebhookBody({ components: [{ type: 10 }] })).toBeNull();
        expect(validateWebhookBody({ poll: { question: { text: "x" } } })).toBeNull();
    });

    it("принимает поддерживаемые флаги", () => {
        expect(validateWebhookBody({ content: "hi", flags: 0 })).toBeNull();
        expect(validateWebhookBody({ content: "hi", flags: SUPPRESS_EMBEDS })).toBeNull();
        expect(validateWebhookBody({ content: "hi", flags: SUPPRESS_NOTIFICATIONS })).toBeNull();
        expect(validateWebhookBody({ content: "hi", flags: SUPPRESS_EMBEDS | SUPPRESS_NOTIFICATIONS })).toBeNull();
    });

    it("отклоняет неподдерживаемые биты флагов", () => {
        expect(validateWebhookBody({ content: "hi", flags: 1 })).toBe("Unsupported flags value passed");
        expect(validateWebhookBody({ content: "hi", flags: SUPPRESS_EMBEDS | 2 })).toBe("Unsupported flags value passed");
    });

    it("разрешает IS_COMPONENTS_V2 только с components", () => {
        expect(validateWebhookBody({ components: [{ type: 10 }], flags: IS_COMPONENTS_V2 })).toBeNull();
    });

    it("запрещает IS_COMPONENTS_V2 вместе с legacy-полями", () => {
        const conflict = "IS_COMPONENTS_V2 cannot be used together with content, embeds, poll, or attachments.";

        expect(validateWebhookBody({ content: "hi", components: [{ type: 10 }], flags: IS_COMPONENTS_V2 })).toBe(conflict);
        expect(validateWebhookBody({ embeds: [{}], components: [{ type: 10 }], flags: IS_COMPONENTS_V2 })).toBe(conflict);
        expect(validateWebhookBody({ poll: {}, components: [{ type: 10 }], flags: IS_COMPONENTS_V2 })).toBe(conflict);
        expect(validateWebhookBody({ attachments: [{}], components: [{ type: 10 }], flags: IS_COMPONENTS_V2 })).toBe(conflict);
    });
});
