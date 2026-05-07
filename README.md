# Mi CRM — Gestión de clientes freelance

CRM mobile-first como PWA instalable en el móvil. React + Vite + Tailwind CSS. Datos en localStorage (sin backend).

## Instalación

```bash
# 1. Entra en la carpeta
cd crm-proyectos

# 2. Instala dependencias
npm install

# 3. Arranca en desarrollo
npm run dev
```

Abre http://localhost:5173 en tu navegador.

## Instalar en el móvil (PWA)

```bash
# Build de producción
npm run build

# Previsualiza el build
npm run preview
```

Después sube la carpeta `dist/` a **Netlify** o **Vercel** (gratis). Una vez publicado:
- Abre la URL desde Chrome en Android → menú → "Añadir a pantalla de inicio"
- En iPhone con Safari → botón compartir → "Añadir a pantalla de inicio"

## Estructura

```
src/
├── components/
│   ├── ContactCard.jsx     ← tarjeta en el listado
│   ├── ContactForm.jsx     ← formulario nuevo/editar
│   ├── ContactDetail.jsx   ← vista detalle
│   ├── FilterBar.jsx       ← filtros por estado
│   └── SearchBar.jsx       ← buscador
├── hooks/
│   └── useContacts.js      ← lógica + localStorage
├── utils/
│   └── helpers.js          ← funciones auxiliares
├── App.jsx                 ← navegación entre vistas
├── main.jsx
└── index.css
```

## Campos de cada contacto

| Campo | Tipo | Descripción |
|-------|------|-------------|
| name | texto | Nombre (obligatorio) |
| email | email | Correo electrónico |
| project | texto | Descripción del proyecto |
| origin | select | Instagram / LinkedIn / Referido / Web propia / WhatsApp / Otro |
| interest | select | Alto / Medio / Bajo |
| status | select | Nuevo / Contactado / En conversación / Validado / Otros |
| statusCustom | texto | Solo si status = "otros" |
| notes | textarea | Notas libres |

## Despliegue en Netlify (gratis)

1. Crea cuenta en netlify.com
2. "Add new site" → "Deploy manually"
3. Arrastra la carpeta `dist/` después de `npm run build`
4. ¡Listo! Tienes tu CRM en la nube con URL propia
