## Developer ideas

This file contains a mix of ideas that the developer comes to while developing

It is like a backlog but with no clean structure. Just ideas that comes to my mind while developing. 

Nothing in this list should be implemented.

It's just a reminder list for the developer. 

You may even find ideas in different languages

### Backlog


- La pagina de knowledge debe estar mucho mas ordenada. Ahora mismo aparecen ahi todos los sources volcados. Habría que divirdirlo de alguna manera que todavia no se.
- api de chat : scope global o solo de proyecto?
- limitar el scope en el chat pudiendo elegir sources/project, varios de ellos etc..
- fire and forget: muchos procesos se alnzan y el servidor sigue por su cuenta. A lo mejor el usuario sube una entrevista larga, el proceso  empieza, algo falla y no tienes el sistema robusto de reinttento resume job etc. Habria que estudiar esto bien. 
- Al hilo del punto anterior, necesitamos un sistema mas robusto por que podemos subir un source, que falle a mitad de camino y algunas cosas se hayan almacenado en la base de datos (e.g. relationships o entities ) y falten algunas. Tenemos que decidir como manejar estas situaciones, no guardamos nada, reintentamos ..etc.  