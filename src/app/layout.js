import "./globals.css";

export const metadata = {
  title: "WebIDE - Browser-Powered Code Editor",
  description:
    "A WebAssembly-powered IDE that runs entirely in your browser. Write Python, JavaScript, C/C++, and SQL with zero server dependency.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              const isLocalDev =
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1';

              if ('serviceWorker' in navigator && !isLocalDev) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    },
                    function(err) {
                      console.log('ServiceWorker registration failed: ', err);
                    }
                  );
                });
              } else if ('serviceWorker' in navigator && isLocalDev) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  registrations.forEach(function(registration) {
                    registration.unregister();
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
