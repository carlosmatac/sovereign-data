## Developer ideas

This file contains a mix of ideas that the developer comes to while developing

It is like a backlog but with no clean structure. Just ideas that comes to my mind while developing. 

Nothing in this list should be implemented.

It's just a reminder list for the developer. 

You may even find ideas in different languages

### Backlog


- Las relaciones no se están creando bien. No puede ser que yo suba un participant y su org/empresa y no se cree una relacion. Eso es básico. Tampoco puede ser que no se creen de algunos sources absolutamente ninguna relacion. El LLM lo está haciendo muy mal ahora mismo. 
- La pagina de knowledge debe estar mucho mas ordenada. Ahora mismo aparecen ahi todos los sources volcados. Habría que divirdirlo de alguna manera que todavia no se.
- En el transcript review solo aparecen las entidades del pipeline (las que escribe el usuario) y no las que saca la IA. Y al contrario. En la pagina de la entrevista solo aparecen las entidades que saca la IA y no las del pipeline. Hay que tener todas en los dos sitios.
- api de chat : scope global o solo de proyecto?
- IMPORTANTE: Parece que el LLM en el retrieval da unas respuestas muy cortas. No debe estar usando todo el contexto de manera apropiada. 
- No deben aparecer todos los sources en la pagina de proyecto. Esa lista puede crecer hacia abajo de manera infinita. Hay que organizarlo mejor. 
- Hay que quitar del sales war room todo lo equivalente a cash, revenue etc o por lo menos hacerlo editable. La idea de esto era volcar la info de los crm de los clientes pero ahora mismo tenemos mock data y es el mismo en todos los proyectos. O lo quitamos o lo hacemos editable. 
- El label que sale en el autocompletado de una entidad cuando se sube un source  es siempre "project". No sé que sentido tiene. No coge el type real de la entidad.
- Implementar el knowledge graph como lo tienen en cala, input/output ... etc
- No está funcionando bien lo de las relaciones de entidades. El LLM no es lo suficientemente bueno como para crearlas o no tiene las instrucciones neceesarias. 
- limitar el scope en el chat pudiendo elegir sources/project, varios de ellos etc..
- fire and forget: muchos procesos se alnzan y el servidor sigue por su cuenta. A lo mejor el usuario sube una entrevista larga, el proceso  empieza, algo falla y no tienes el sistema robusto de reinttento resume job etc. Habria que estudiar esto bien. 
- Al hilo del punto anterior, necesitamos un sistema mas robusto por que podemos subir un source, que falle a mitad de camino y algunas cosas se hayan almacenado en la base de datos (e.g. relationships o entities ) y falten algunas. Tenemos que decidir como manejar estas situaciones, no guardamos nada, reintentamos ..etc. 
 
- Creo que ahora es redundante la entidad del proyecto. He visto en el Network Explorer dos veces Angola.  
- Quiero crear un dibujo en varias fases para dar la sensacion de cargando.. cuando preguntas al chat.