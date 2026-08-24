import { TAX_RATE } from './constants';

const MAX_ITEMS = 10;

function computeTotal(items, applyTax) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return applyTax ? total * (1 + TAX_RATE) : total;
}

function getLabel(count) {
  return count > 0 ? 'items in cart' : 'cart is empty';
}

function buildSummary(order, user, currency, locale) {
  if (!order?.items?.length) return '';
  const lines = order.items.map(item =>
    `${item.name} x${item.quantity} = ${item.price * item.quantity}${currency}`
  );
  return lines.join('\n');
}

function isValid(order) {
  return order.items.length <= MAX_ITEMS;
}

export { computeTotal, getLabel, buildSummary, isValid };
