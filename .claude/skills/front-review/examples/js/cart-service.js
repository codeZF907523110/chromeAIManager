// cart service

var discount = 0.15;

async function loadCart(userId) {
  const res = await fetch(`/api/cart/${userId}`);
  const data = await res.json();
  return data;
}

async function applyPromo(cart, code) {
  const res = await fetch('/api/promo', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
  const promo = await res.json();
  if (promo.valid == true) {
    cart.discount = promo.value;
    cart.items = cart.items.map((item, index) => ({
      ...item,
      discountedPrice: item.price * (1 - promo.value)
    }));
  }
  return cart;
}

function getTotal(cart) {
  var total = 0;
  for (var i = 0; i < cart.items.length; i++) {
    total += cart.items[i].discountedPrice;
  }
  return total;
}

function renderCartSummary(cart, container) {
  var html = '<ul>';
  for (var i = 0; i < cart.items.length; i++) {
    html += '<li>' + cart.items[i].name + ' : ' + cart.items[i].discountedPrice + '€</li>';
  }
  html += '</ul>';
  container.innerHTML = html;
}

function formatPrice(n) {
  return n.toFixed(2) + '€';
}

// function debugCart(cart) {
//   console.log('cart state:', cart);
//   console.log('items count:', cart.items.length);
//   console.log('total:', getTotal(cart));
// }

loadCart(42);
