## Developer ideas

This file contains a mix of ideas that the developer comes to while developing

It is like a backlog but with no clean structure. Just ideas that comes to my mind while developing. 

Nothing in this list should be implemented.

It's just a reminder list for the developer. 

You may even find ideas in different languages

### Backlog


- SUPER URGENTE: Estamos actualmente guardando las entrevistas en un bucket publico de Supabase para que Assembly AI pueda acceder mas facilmente. Cualquier persona con la url puede acceder. Esto hay que cambiarlo
- Hay que meter descripciones en alguno de los campos de la tabla de sources_entities. Podemos usar el campo metadata o un campo nuevo descripcion. Esto le da más contexto al LLM y sera capaz de saber en qué consiste la relacion entre ese source y la entidad. En general diría que todas las relaciones entre tablas deben ser descritas si van a ayudar al LLM a proporcionar más contexto al usuario.
- Haría falta tambien poder likear entidades a proyectos, no solo a su source. Es necesario ver como escala esto también porque no todos los clientes tienen por qué dividir los proyectos de la misma manera o incluso puede que no sean proyectos y simplemetne sean departamentos etc... Tambien no restringir que una entidad esté anclada a un único proyecto. Deberia haber una tabla así como project - entity (desde el absoluto desconocimiento de bases de datos)
- Cuando se vaya a hacer upload de un source (e.g. entrevista) y haya que poner nombres de persona u organizacion. Estaría muy bien que puediera hacerse un autocompletado buscando entidades en la base de datos. De esta manera evitamos que la IA tenga que adivinar que es la misma entidad en caso de que ya esté almacenada en la base de datos. 
- En la parte de entities mentioned dentro de un source, solo aparecen las entities mencionadas literalmente. Me gustaría que estuvieran todas las relacionadas, aunque no se mencionen (e.g. interviewee).
- En la revision del transcript, el panel de linkear o añadir nuevas entidades hace falta que esté en un lateral y no abajo. Es mucho más fácil así para el usuario. 
- Si una entidad es inferida por la IA se almacena con una descripcion por defecto que decide la IA. Estas descripciones se deberían ir reforzando conforme más veces son mencionadas. Esto va añadiendo contexto al sistema .
