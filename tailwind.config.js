/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                gray: {
                    750: '#2d3748',
                    850: '#1a202c',
                    950: '#0d1117',
                },
                primary: {
                    50: '#f2f5f9',
                    100: '#e1e8f0',
                    200: '#c7d3e3',
                    300: '#a1b6cf',
                    400: '#7391b4',
                    500: '#1c2d4f', // Nexus Pro Primary
                    600: '#162441',
                    700: '#121d33',
                },
                success: {
                    500: '#10b981',
                    600: '#059669', // Emerald Sucesso
                },
                tech: {
                    500: '#10b981',
                    600: '#059669',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
