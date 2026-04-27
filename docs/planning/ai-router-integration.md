# Integracion de router de IA

Ultima actualizacion: 2026-04-27.

## Decision

No reutilizar directamente el router de `cyoc-frontend`.

Si reutilizar:

- el patron de adapters por proveedor,
- la normalizacion de errores,
- el concepto de factory/router,
- parte de las implementaciones de OpenAI y OpenRouter como referencia tecnica.

## Por que no copiarlo tal cual

En `cyoc-frontend` el router actual esta muy acoplado a un caso de uso concreto:

- [NutritionAiRouter.ts](/mnt/c/Users/samir/Documents/freelance/cyoc/cyoc-frontend/src/domain/ai-router/NutritionAiRouter.ts)
- [mealAnalysisContract.ts](/mnt/c/Users/samir/Documents/freelance/cyoc/cyoc-frontend/src/infrastructure/ai/shared/mealAnalysisContract.ts)
- [mealAnalysisMapper.ts](/mnt/c/Users/samir/Documents/freelance/cyoc/cyoc-frontend/src/infrastructure/ai/shared/mealAnalysisMapper.ts)
- [analyzeMealDraft.ts](/mnt/c/Users/samir/Documents/freelance/cyoc/cyoc-frontend/src/application/meal/analyzeMealDraft.ts)

Problemas para 42day:

- el contrato de salida es de analisis nutricional, no de pedidos o menus,
- los prompts viven pegados al dominio de comidas del otro proyecto,
- el flujo de configuracion depende de onboarding/frontend movil,
- la seleccion del provider esta pensada para storage/app local.

## Que si sirve como referencia

- [providerFactory.ts](/mnt/c/Users/samir/Documents/freelance/cyoc/cyoc-frontend/src/infrastructure/ai/providerFactory.ts)
- [providerHttp.ts](/mnt/c/Users/samir/Documents/freelance/cyoc/cyoc-frontend/src/infrastructure/ai/shared/providerHttp.ts)
- [OpenAiProvider.ts](/mnt/c/Users/samir/Documents/freelance/cyoc/cyoc-frontend/src/infrastructure/ai/openai/OpenAiProvider.ts)
- [OpenRouterProvider.ts](/mnt/c/Users/samir/Documents/freelance/cyoc/cyoc-frontend/src/infrastructure/ai/openrouter/OpenRouterProvider.ts)

## Nuevo paquete generico

Se creo un scaffold reutilizable en:

- `/mnt/c/Users/samir/Documents/freelance/t-router`

Nombre decidido para evolucionarlo como dependencia:

```txt
t-router
```

Objetivo:

- desacoplar proveedores del dominio de 42day,
- soportar credenciales por tenant,
- reutilizarlo entre proyectos.

## Casos de uso previstos en 42day

1. parser semantico de pedido libre
2. ingestion de menu desde PDF, imagen o texto
3. fallback cuando el flujo determinista no alcanza

## Recomendacion de integracion en 42day

Agregar una tabla o configuracion equivalente por tenant:

```txt
control.tenant_ai_provider_configs
  tenant_id
  provider_id
  auth_mode
  encrypted_api_key
  encrypted_access_token
  default_model
  provider_extra
  status
  created_at
  updated_at
```

Y desde backend:

1. resolver tenant,
2. cargar config del provider del tenant,
3. construir task segun caso de uso,
4. ejecutar contra el router generico.

## Regla importante

Prompts y schemas de salida deben vivir en 42day, no dentro del paquete generico.

## Siguiente referencia

Para el plan actualizado de adopcion como dependencia:

- [t-router-adoption-plan.md](/mnt/c/Users/samir/Documents/freelance/42day/docs/planning/t-router-adoption-plan.md)
