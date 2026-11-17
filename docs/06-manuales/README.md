# Manuales

Manual de usuario, manual técnico y guía de instalación y despliegue.

## Logotipos de empresas

La API recibe el logotipo en `POST /empresas/:empresaId/logo`, en un campo multipart llamado `logo`.
Solo puede subirlo un usuario con membresía activa y permiso `empresa.configurar` en esa empresa. Se aceptan
imágenes PNG, JPG y WebP de hasta 2 MB.

En Supabase Storage, crea un bucket público llamado `logos` con esos tipos MIME y el límite de 2 MB.
La API necesita `SUPABASE_URL` y `SUPABASE_SECRET_KEY`; configura la clave secreta solo en el entorno
del servidor (por ejemplo, Render). Puede cambiarse el nombre del bucket con `SUPABASE_LOGOS_BUCKET`.

- [Guía de despliegue](despliegue.md): Vercel (web), Render (API) y Supabase (base de datos).
