AI Feature Transfer Reference

Source repository root:
C:/Users/Aman/Desktop/dukaan-saarthi-ai-clean

Source app root:
C:/Users/Aman/Desktop/dukaan-saarthi-ai-clean/dukaanbright

Copy these files from source repo to target repo (same relative paths):

1. dukaanbright/package.json
2. dukaanbright/package-lock.json
3. dukaanbright/src/app/(app)/add-product/page.tsx
4. dukaanbright/src/app/(app)/insights/page.tsx
5. dukaanbright/src/app/api/insights/actions/route.ts
6. dukaanbright/src/app/api/openfoodfacts/route.ts
7. dukaanbright/src/app/api/serpapi/route.ts
8. dukaanbright/src/lib/insights/demandAnalysis.ts
9. dukaanbright/src/lib/insights/discountEngine.ts
10. dukaanbright/src/lib/insights/insightGenerator.ts
11. dukaanbright/src/lib/insights/kpiSpotlight.ts
12. dukaanbright/src/lib/insights/pricingEngine.ts
13. dukaanbright/src/lib/insights/priorityScoring.ts
14. dukaanbright/src/lib/insights/profitAnalysis.ts
15. dukaanbright/src/lib/insights/refillEngine.ts
16. dukaanbright/src/lib/openFoodFacts.ts
17. dukaanbright/src/lib/scanner.ts
18. dukaanbright/src/lib/supabase/server.ts
19. dukaanbright/src/lib/supabase/shopResolver.ts
20. dukaanbright/src/lib/utils.ts
21. dukaanbright/src/types/index.ts
22. dukaanbright/supabase/phase1_schema.sql

Notes:
- Do not copy .env files.
- Keep target repo .gitignore behavior for secrets.
- After copy, run npm install and npm run build inside dukaanbright.
