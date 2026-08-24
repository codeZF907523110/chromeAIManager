import './navigate-loader.css';

const loader = document.createElement('div');
loader.className = 'navigate-loader';
document.body.prepend(loader);

function navigateWithTransition(e) {
    if (!document.startViewTransition) return;
    e.preventDefault();
    const url = e.currentTarget.href;

    document.startViewTransition(() => {
        return new Promise(resolve => {
            window.location.href = url;
            resolve();
        });
    });
}

document.querySelectorAll('.nav a').forEach(link => {
    link.addEventListener('click', navigateWithTransition);
});