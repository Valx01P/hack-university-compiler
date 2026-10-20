export const CATEGORIES = ["kitchen", "office", "garden"];
export function isLowStock(item, threshold) {
    return item.qty <= threshold;
}
