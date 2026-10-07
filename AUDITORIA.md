# Revisión editorial del banco B250

**Banco activo: 250 preguntas. Versión 20261007-estandar250.** La web oficial es [GitHub Pages](https://tgb96.github.io/prueba-conocimientos-tribunales/?v=20261007-estandar250).

Se revisaron las 250 preguntas base respecto de su contenido, enunciado, alternativas, clave y explicación, contrastándolas con las páginas del Manual Único para Tribunales de octubre de 2025. Los dos exámenes proporcionados orientan el estilo; las alternativas marcadas en esos documentos no se tomaron como pauta oficial.

## Criterio de estudio aplicado

- Preguntar información explícita del manual, con el procedimiento, cargo, hito o condición necesarios para resolverla.
- Usar cinco alternativas distintas y una única respuesta seleccionable.
- Mantener las tareas de los ejemplos: reconocer definiciones y funciones, distinguir cifras, plazos y condiciones, evaluar enumeraciones o afirmaciones de un mismo subtema y ordenar etapas descritas.
- Evitar enunciados genéricos acompañados de respuestas incompletas, mezclas de materias sin relación y distractores ajenos al objeto de la pregunta.
- Explicar cada proposición y el fundamento de la clave, con páginas del manual. Las preguntas negativas piden expresamente las falsas o incorrectas.

## Cambios de contenido

Se sustituyeron las 120 combinaciones genéricas de la base anterior por preguntas redactadas sobre subtemas concretos. Algunas se convirtieron en directas y una en ordenación. Se revisaron también el piloto, las preguntas directas restantes y todas las secuencias.

Se corrigieron enunciados y alternativas con discordancias gramaticales; se precisó la autorización de actuaciones cuando la ley la exige; se mejoraron los distractores de inspección, peritos, archivo provisional, unificación laboral y condiciones de suspensión penal; se sustituyeron repeticiones por tutela laboral, excepciones civiles y recursos penales. La secuencia de acuerdos de Corte distingue hechos, derecho y resolución final, sin tratar la regla sobre quién vota primero como una etapa posterior independiente.

Las combinaciones ya no repiten siempre dos verdaderas y una falsa. Contienen entre tres y seis proposiciones, patrones variados, casos de todas o ninguna correctas y preguntas negativas. Las alternativas cercanas a la clave incluyen u omiten proposiciones plausibles. Se distribuyeron las claves sin una secuencia fija de letras: cincuenta de cada letra en el banco.

Los ejemplos observados por el usuario permanecen corregidos: sentencia civil pregunta explícitamente el plazo y su hito (sesenta días, página 54); el archivo provisional de VIF exige la incomparecencia también a la nueva audiencia (página 80).

## Comparación de formatos

Se identifican 61 ítems visibles en los dos modelos; uno repite una pregunta de ordenación. La proporción usa todos los ítems visibles como referencia del formato de las pruebas.

| Formato | Modelos | Banco revisado |
|---|---:|---:|
| Directas | 28 de 61 (45,9 %) | 115 de 250 (46,0 %) |
| Combinaciones | 30 de 61 (49,2 %) | 123 de 250 (49,2 %) |
| Ordenación | 3 de 61 (4,9 %) | 12 de 250 (4,8 %) |
| Preguntas negativas | 8 de 61 (13,1 %) | 35 de 250 (14,0 %) |

La dificultad se aproxima editorialmente a las tareas de recuerdo y discriminación de los modelos. No hay casos largos, jurisprudencia ni contenido externo que deba conocerse para resolver las preguntas. Dos modelos permiten esta aproximación; no permiten demostrar que el resultado reproduzca estadísticamente la dificultad de un examen futuro.

## Intentos y comprobaciones

Cada intento conserva 30 preguntas distintas y la cuota provisional de temas inferida de los modelos: **6 / 2 / 3 / 3 / 2 / 2 / 7 / 3 / 2**, para capítulos 1 a 9. Esto incluye tres de Cortes de Apelaciones y dos de Corte Suprema.

El intento tiene **14 directas**, **una o dos ordenaciones** y **15 o 14 combinaciones**, respectivamente. La proporción media de ordenaciones se aproxima a los modelos. La selección distribuye aleatoriamente estos formatos entre capítulos manteniendo simultáneamente ambas cuotas.

La verificación automática pasó en los 250 registros: alternativas distintas, claves válidas, correspondencia exacta de cada combinación con las verdades y la instrucción negativa, integridad de las permutaciones de ordenación, citas de páginas y registros de revisión. Estas comprobaciones técnicas son distintas de la revisión de contenido descrita arriba.

Se simularon **5000 intentos**, todos con las cuotas y sin duplicados. Se obtuvieron 5000 conjuntos diferentes y aparecieron las 250 preguntas del banco. Se comprobó el flujo completo en Chrome con anchos de 1366 y 390 píxeles: carga, respuesta, navegación, finalización y treinta correcciones; sin errores de JavaScript ni desbordamiento horizontal.

## Trazabilidad y alcance

[REVISION_B250.json](REVISION_B250.json) registra cada ítem, su clave, páginas, fundamento y referencia de formato. El banco activo es [banco_B250.json](banco_B250.json). El antiguo nombre banco_B500.json se conserva como alias de compatibilidad que entrega estas mismas 250 preguntas; no representa otras 250 preguntas ni amplía el banco.

La pauta se reconstruye desde la edición del manual proporcionada. Es material de práctica revisado, sin pretensión de ser una pauta oficial. La duración y fórmula de nota siguen siendo provisionales hasta contar con las bases de la evaluación.
