// PLANTILLA de referencia, y a la vez la version APAGADA (la de produccion).
//
// El archivo que de verdad usa la aplicacion es diagnostico/rutas.ts, que
// GENERA aws/pipeline/publish-web.sh segun la variable de entorno DEBUG, y que
// no se versiona (ver .gitignore).
//
// POR QUE LA RUTA SE GENERA Y NO ES UN SIMPLE "if"
//   Un if sobre un flag esconde la vista, pero NO la borra: Angular sigue
//   compilando el componente y subiendo su chunk al bucket, donde queda
//   descargable aunque no haya forma de navegar hasta el. Al generar este
//   archivo, con DEBUG=false NADIE importa el componente: no se compila, no
//   hay chunk y no hay nada que descargar. Medido en dist/, no supuesto.
//
// Para trabajar sin desplegar nada, copia este archivo a diagnostico/rutas.ts
// (igual que aws-config.example.ts -> aws-config.ts). Si quieres la vista
// encendida en local, copia diagnostico/rutas.example-debug.ts.
import { Routes } from '@angular/router';

export const rutasDiagnostico: Routes = [];
