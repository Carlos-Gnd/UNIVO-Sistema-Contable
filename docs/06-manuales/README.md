# Manuales

## Logotipos de empresas

La API recibe el logotipo en `POST /empresas/:empresaId/logo`, en un campo multipart llamado `logo`.
Solo puede subirlo un usuario con membresÃ­a activa y rol `administrador` en esa empresa. Se aceptan
imÃ¡genes PNG, JPG y WebP de hasta 2 MB.

En Supabase Storage, crea un bucket pÃºblico llamado `logos` con esos tipos MIME y el lÃ­mite de 2 MB.
La API necesita `SUPABASE_URL` y `SUPABASE_SECRET_KEY`; configura la clave secreta solo en el entorno
del servidor (por ejemplo, Render). Puede cambiarse el nombre del bucket con `SUPABASE_LOGOS_BUCKET`.

Manual de usuario, manual técnico y guía de instalación y despliegue.
