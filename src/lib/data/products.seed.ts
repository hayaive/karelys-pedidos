// Generado desde lista_de_productos_sistema.xlsx (catálogo inicial real)
export type SeedProduct = { code: string; name: string; category: string; mayor: number; detal: number };
export const SEED_PRODUCTS: SeedProduct[] = [
  {
    // Producto único de la familia de tortas frías. Sustituye a los 13 sabores
    // individuales que traía el Excel (P001–P013): el negocio ya no elige sabor
    // al vender, así que el catálogo nace con un solo ítem. Esos códigos quedan
    // retirados y no se reutilizan (ver COLD_CAKE_LEGACY_FLAVORS en
    // lib/pricing-rules, que es lo que la migración v3 elimina en
    // instalaciones existentes).
    "code": "P060",
    "name": "Tortas Frías",
    "category": "Tortas Frías",
    "mayor": 1.1,
    "detal": 1.11
  },
  {
    "code": "P014",
    "name": "brownie",
    "category": "Postres",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    // Pertenece a la familia de tortas frías con precio propio y diferenciado
    // (ver lib/pricing-rules). Antes estaba en "Postres".
    "code": "P015",
    "name": "Torta Quesillo",
    "category": "Tortas Frías",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    "code": "P016",
    "name": "brownie-quesillo",
    "category": "Postres",
    "mayor": 1.5,
    "detal": 1.5
  },
  {
    "code": "P017",
    "name": "Beso de Angel",
    "category": "Postres",
    "mayor": 1.5,
    "detal": 1.5
  },
  {
    "code": "P018",
    "name": "yogurt",
    "category": "Postres",
    "mayor": 2.3,
    "detal": 2.5
  },
  {
    "code": "P019",
    "name": "Quesillo pote",
    "category": "Postres",
    "mayor": 2.3,
    "detal": 2.5
  },
  {
    "code": "P020",
    "name": "Quesillo Racion",
    "category": "Postres",
    "mayor": 1.1,
    "detal": 1.11
  },
  {
    "code": "P021",
    "name": "gelatina",
    "category": "Postres",
    "mayor": 1.5,
    "detal": 2.0
  },
  {
    "code": "P022",
    "name": "bandeja de tequeños 30 und",
    "category": "Postres",
    "mayor": 1.5,
    "detal": 2.0
  },
  {
    "code": "P023",
    "name": "bandeja de pasapalos 100 und",
    "category": "Postres",
    "mayor": 6.0,
    "detal": 7.0
  },
  {
    "code": "P024",
    "name": "Quesillo Redondo",
    "category": "Postres",
    "mayor": 3.5,
    "detal": 4.0
  },
  {
    "code": "P025",
    "name": "Biscocho Marmoleado",
    "category": "Panadería",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    "code": "P026",
    "name": "Biscocho piña",
    "category": "Panadería",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    "code": "P027",
    "name": "Cortaditos",
    "category": "Panadería",
    "mayor": 1.1,
    "detal": 1.11
  },
  {
    "code": "P028",
    "name": "catalina",
    "category": "Panadería",
    "mayor": 1.1,
    "detal": 1.11
  },
  {
    "code": "P029",
    "name": "patelitos",
    "category": "Panadería",
    "mayor": 1.1,
    "detal": 1.36
  },
  {
    "code": "P030",
    "name": "galleta pasta seca",
    "category": "Panadería",
    "mayor": 0.6,
    "detal": 0.6
  },
  {
    "code": "P031",
    "name": "palmeritas",
    "category": "Panadería",
    "mayor": 1.1,
    "detal": 1.11
  },
  {
    "code": "P032",
    "name": "polvorosas",
    "category": "Panadería",
    "mayor": 1.1,
    "detal": 1.11
  },
  {
    "code": "P033",
    "name": "pan grande fruta",
    "category": "Panadería",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    "code": "P034",
    "name": "pan grande azucarado",
    "category": "Panadería",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    "code": "P035",
    "name": "pan de arequipe grande",
    "category": "Panadería",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    "code": "P036",
    "name": "pan de guayaba grade",
    "category": "Panadería",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    "code": "P037",
    "name": "pan de tunja",
    "category": "Panadería",
    "mayor": 1.3,
    "detal": 1.36
  },
  {
    "code": "P038",
    "name": "golfeado",
    "category": "Panadería",
    "mayor": 1.1,
    "detal": 1.11
  },
  {
    "code": "P039",
    "name": "pecho de niña",
    "category": "Panadería",
    "mayor": 1.3,
    "detal": 1.11
  },
  {
    "code": "P040",
    "name": "refresco de botella",
    "category": "Bebidas",
    "mayor": 1.0,
    "detal": 1.0
  },
  {
    "code": "P041",
    "name": "agua mineral",
    "category": "Bebidas",
    "mayor": 1.0,
    "detal": 1.0
  },
  {
    "code": "P042",
    "name": "refresco litro y medio",
    "category": "Bebidas",
    "mayor": 1.1,
    "detal": 1.1
  },
  {
    "code": "P043",
    "name": "Grande 3kg",
    "category": "Tortas",
    "mayor": 13.0,
    "detal": 13.0
  },
  {
    "code": "P044",
    "name": "Mediano. 2kg",
    "category": "Tortas",
    "mayor": 11.0,
    "detal": 11.0
  },
  {
    "code": "P045",
    "name": "kilo y medio",
    "category": "Tortas",
    "mayor": 8.0,
    "detal": 8.0
  },
  {
    "code": "P046",
    "name": "Pequeño 1 kg",
    "category": "Tortas",
    "mayor": 7.0,
    "detal": 7.0
  },
  {
    "code": "P047",
    "name": "Mini. 700 gr",
    "category": "Tortas",
    "mayor": 5.0,
    "detal": 5.0
  },
  {
    "code": "P048",
    "name": "bolsa de regalo",
    "category": "Fiesta",
    "mayor": 2.0,
    "detal": 2.0
  },
  {
    "code": "P049",
    "name": "bandanas",
    "category": "Fiesta",
    "mayor": 2.5,
    "detal": 2.5
  },
  {
    "code": "P050",
    "name": "vela de numero",
    "category": "Fiesta",
    "mayor": 1.0,
    "detal": 1.0
  },
  {
    "code": "P051",
    "name": "vela volcanica",
    "category": "Fiesta",
    "mayor": 1.0,
    "detal": 1.0
  },
  {
    "code": "P052",
    "name": "vela escarchada",
    "category": "Fiesta",
    "mayor": 1.2,
    "detal": 1.2
  },
  {
    "code": "P053",
    "name": "vela unitaria",
    "category": "Fiesta",
    "mayor": 0.5,
    "detal": 0.5
  },
  {
    "code": "P054",
    "name": "toppers",
    "category": "Fiesta",
    "mayor": 2.0,
    "detal": 2.0
  },
  {
    "code": "P055",
    "name": "globo feliz cumpleaños",
    "category": "Fiesta",
    "mayor": 1.5,
    "detal": 1.5
  },
  {
    "code": "P056",
    "name": "globo de nuemero",
    "category": "Fiesta",
    "mayor": 1.2,
    "detal": 1.2
  },
  {
    "code": "P057",
    "name": "cortina",
    "category": "Fiesta",
    "mayor": 1.5,
    "detal": 1.5
  },
  {
    "code": "P058",
    "name": "mantel para fiesta",
    "category": "Fiesta",
    "mayor": 1.5,
    "detal": 1.5
  },
  {
    // Segundo sabor con precio propio y diferenciado dentro de tortas frías.
    // No venía en el Excel original; precio alineado a "Torta Quesillo"
    // (pendiente de confirmar con el negocio).
    "code": "P059",
    "name": "Oreo y Brownie",
    "category": "Tortas Frías",
    "mayor": 1.3,
    "detal": 1.36
  }
];
