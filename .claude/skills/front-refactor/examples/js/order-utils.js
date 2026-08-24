import { formatDate } from './date-helpers';
import { logEvent } from './analytics';
import { TAX_RATE } from './constants';

var maxItems = 10;

function computeTotal(items, applyTax) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].quantity;
  }
  if (applyTax == true) {
    total = total * (1 + TAX_RATE);
  }
  return total;
}

function getLabel(count) {
  var label;
  if (count > 0) {
    label = 'items in cart';
  } else {
    label = 'cart is empty';
  }
  return label;
}

function buildSummary(order, user, currency, locale) {
  if (order) {
    if (order.items) {
      if (order.items.length > 0) {
        var lines = order.items.map(function(item) {
          return item.name + ' x' + item.quantity + ' = ' + item.price * item.quantity + currency;
        });
        return lines.join('\n');
      }
    }
  }
  return '';
}

function isValid(order) {
  if (order.items.length > maxItems) {
    return false;
  } else {
    return true;
  }
}

// function debugOrder(order) {
//   console.log('order:', order);
//   console.log('total:', computeTotal(order.items, true));
// }

export { computeTotal, getLabel, buildSummary, isValid };
