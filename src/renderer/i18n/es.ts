/**
 * es.ts — Spanish string table (pilot locale).
 * Wave 38 Phase G: full translations. Brand names (Ouroboros, Claude Code, Claude)
 * are intentionally preserved in English as they are non-translatable proper nouns.
 */
export const ES_STRINGS = {
  onboarding: {
    step1: {
      title: 'Bienvenido a Ouroboros',
      body: 'Tu IDE con IA para ejecutar y monitorear sesiones de Claude Code.',
    },
    step2: {
      title: 'Tus sesiones',
      body: 'Cada pestaña de terminal es una sesión independiente de Claude Code. Cambia entre ellas libremente.',
    },
    step3: {
      title: 'Conciencia del contexto',
      body: 'Abre una carpeta de proyecto para que Claude pueda leer tu código fuente y darte mejores respuestas.',
    },
    step4: {
      title: 'Paleta de comandos',
      body: 'Pulsa Cmd+Shift+P (o Ctrl+Shift+P) para acceder a todos los comandos del IDE.',
    },
    step5: {
      title: 'Configuración',
      body: 'Accede a la configuración desde la barra de estado en cualquier momento para personalizar tu experiencia.',
    },
  },
  emptyState: {
    chat: {
      primary: 'Inicia una conversación o prueba un mensaje de ejemplo',
      dismiss: 'Entendido',
    },
    fileTree: {
      primary: 'Abre una carpeta de proyecto para explorar los archivos',
      action: 'Abrir carpeta',
      dismiss: 'Descartar',
    },
    terminal: {
      primary: 'Pulsa + para abrir un terminal o iniciar una sesión de Claude',
      action: 'Nuevo terminal',
      dismiss: 'Descartar',
    },
  },
  settings: {
    updateChannel: {
      label: 'Canal de actualización',
      stable: 'Estable',
      beta: 'Beta',
    },
    language: {
      label: 'Idioma',
      english: 'English',
      spanish: 'Español',
    },
    crashReports: {
      label: 'Informes de errores',
      enableOptIn: 'Enviar informes de errores anónimos para ayudar a mejorar Ouroboros',
      webhookLabel: 'URL del webhook para informes de errores',
    },
  },
  changelog: {
    drawer: {
      title: 'Novedades',
      dismissAll: 'Descartar todo',
    },
  },
  tour: {
    next: 'Siguiente',
    back: 'Atrás',
    skip: 'Omitir tour',
    done: 'Hecho',
  },
  common: {
    close: 'Cerrar',
    cancel: 'Cancelar',
    save: 'Guardar',
    ok: 'Aceptar',
    loading: 'Cargando…',
    error: 'Algo salió mal',
  },
};
