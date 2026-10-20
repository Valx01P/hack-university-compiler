export declare const CATEGORIES: readonly ["kitchen", "office", "garden"];
export type Category = (typeof CATEGORIES)[number];
export type Item = {
    readonly sku: string;
    readonly name: string;
    readonly category: Category;
    readonly qty: number;
    readonly priceCents: number;
    readonly updatedAt: string;
};
export declare function isLowStock(item: Pick<Item, "qty">, threshold: number): boolean;
