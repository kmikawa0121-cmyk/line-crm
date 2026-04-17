/**
 * フォローアップメッセージのルール設定
 *
 * triggers: 購入後何日後に送るか（日数の配列）
 * products: 特定商品コードに適用するルール（空なら全商品共通）
 *
 * 商品コードはスマレジの「商品コード」と一致させてください
 */

const DEFAULT_TRIGGERS = [3, 7]; // 全商品：購入後3日・7日

const PRODUCT_RULES = [
  {
    // 例：ケア系商品 → 1ヶ月後に追加フォロー
    productCodes: ['CARE001', 'CARE002', 'CARE003'],
    triggers: [3, 7, 30],
  },
  {
    // 例：高額商品 → 3日後のみ
    productCodes: ['PREMIUM001'],
    triggers: [3],
  },
];

/**
 * 購入した商品コード一覧から、送信すべき日数リストを返す
 * @param {string[]} purchasedCodes
 * @returns {number[]} 重複なしの日数リスト
 */
function getFollowUpDays(purchasedCodes) {
  const days = new Set(DEFAULT_TRIGGERS);

  for (const rule of PRODUCT_RULES) {
    const matched = rule.productCodes.some((code) => purchasedCodes.includes(code));
    if (matched) {
      rule.triggers.forEach((d) => days.add(d));
    }
  }

  return Array.from(days).sort((a, b) => a - b);
}

module.exports = { getFollowUpDays };
