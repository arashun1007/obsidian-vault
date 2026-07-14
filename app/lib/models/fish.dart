import 'package:flutter/material.dart';

/// A single species entry from `assets/data/fish.json`.
///
/// The dataset is authored by a generator (`tool/gen_fish.py`) so every
/// entry shares the same shape. Keep this model in sync with that schema.
@immutable
class Fish {
  const Fish({
    required this.id,
    required this.name,
    required this.kana,
    required this.scientificName,
    required this.family,
    required this.category,
    required this.categoryLabel,
    required this.accentColor,
    required this.seasonMonths,
    required this.typicalSizeCm,
    required this.distribution,
    required this.habitat,
    required this.taste,
    required this.cookingMethods,
    required this.aliases,
    required this.description,
    required this.tasteRating,
    required this.priceRating,
    required this.rarityRating,
    required this.flavor,
    this.imageAsset,
  });

  final String id;

  /// 和名 (standard Japanese name).
  final String name;

  /// よみがな — used for kana-ordered sorting and search.
  final String kana;

  /// 学名 (scientific / Latin name).
  final String scientificName;

  /// 科 (family).
  final String family;

  /// Category key, e.g. `blue`, `white`, `shellfish`.
  final String category;

  /// Human-readable category label, e.g. 青魚.
  final String categoryLabel;

  /// Accent colour for the category, used by cards and the placeholder.
  final Color accentColor;

  /// Months (1-12) when the species is in season (旬).
  final List<int> seasonMonths;

  /// Typical / maximum size in centimetres.
  final int typicalSizeCm;

  final String distribution;
  final String habitat;
  final String taste;
  final List<String> cookingMethods;

  /// 別名・地方名 (alternative and regional names).
  final List<String> aliases;

  final String description;

  /// 食味 rating (deliciousness), 1.0-5.0 in half steps.
  final double tasteRating;

  /// 価格帯 rating (1 = cheap … 5 = luxury), 1.0-5.0.
  final double priceRating;

  /// 希少度 rating (1 = everywhere … 5 = rarely seen), 1.0-5.0.
  final double rarityRating;

  /// Flavour radar values keyed by axis (`fat`, `umami`, `firmness`,
  /// `richness`, `aroma`), each 1.0-5.0.
  final Map<String, double> flavor;

  /// Bundled photo path (e.g. `assets/images/madai.webp`).
  ///
  /// `null` until the image2 pipeline supplies artwork; the UI shows a
  /// generated placeholder in the meantime.
  final String? imageAsset;

  bool get hasImage => imageAsset != null && imageAsset!.isNotEmpty;

  /// True when [month] (1-12) is within this species' season.
  bool inSeason(int month) => seasonMonths.contains(month);

  /// Everything worth matching a free-text query against.
  bool matches(String query) {
    if (query.isEmpty) return true;
    final q = query.toLowerCase();
    if (name.toLowerCase().contains(q)) return true;
    if (kana.contains(query)) return true;
    if (scientificName.toLowerCase().contains(q)) return true;
    if (family.contains(query)) return true;
    if (categoryLabel.contains(query)) return true;
    for (final a in aliases) {
      if (a.toLowerCase().contains(q)) return true;
    }
    return false;
  }

  static Color _parseColor(String hex) {
    var value = hex.replaceFirst('#', '');
    if (value.length == 6) value = 'FF$value';
    return Color(int.parse(value, radix: 16));
  }

  factory Fish.fromJson(Map<String, dynamic> json) {
    return Fish(
      id: json['id'] as String,
      name: json['name'] as String,
      kana: json['kana'] as String,
      scientificName: json['scientificName'] as String,
      family: json['family'] as String,
      category: json['category'] as String,
      categoryLabel: json['categoryLabel'] as String,
      accentColor: _parseColor(json['accentColor'] as String),
      seasonMonths: (json['seasonMonths'] as List<dynamic>)
          .map((e) => e as int)
          .toList(),
      typicalSizeCm: json['typicalSizeCm'] as int,
      distribution: json['distribution'] as String,
      habitat: json['habitat'] as String,
      taste: json['taste'] as String,
      cookingMethods: (json['cookingMethods'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      aliases: (json['aliases'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      description: json['description'] as String,
      tasteRating: (json['ratings']['taste'] as num).toDouble(),
      priceRating: (json['ratings']['price'] as num).toDouble(),
      rarityRating: (json['ratings']['rarity'] as num).toDouble(),
      flavor: (json['flavor'] as Map<String, dynamic>)
          .map((k, v) => MapEntry(k, (v as num).toDouble())),
      imageAsset: json['imageAsset'] as String?,
    );
  }
}

/// A flavour radar axis descriptor from the dataset header.
@immutable
class FlavorAxis {
  const FlavorAxis({required this.key, required this.label});
  final String key;
  final String label;

  factory FlavorAxis.fromJson(Map<String, dynamic> json) =>
      FlavorAxis(key: json['key'] as String, label: json['label'] as String);
}

/// A category descriptor from the dataset header.
@immutable
class FishCategory {
  const FishCategory({
    required this.key,
    required this.label,
    required this.accentColor,
  });

  final String key;
  final String label;
  final Color accentColor;

  factory FishCategory.fromJson(Map<String, dynamic> json) {
    return FishCategory(
      key: json['key'] as String,
      label: json['label'] as String,
      accentColor: Fish._parseColor(json['accentColor'] as String),
    );
  }
}
