import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../models/fish.dart';

/// Loads and caches the bundled species dataset.
///
/// The whole dataset is small (a single JSON asset), so it is loaded once
/// and kept in memory. Filtering/sorting happens on the in-memory list.
class FishRepository {
  FishRepository._();
  static final FishRepository instance = FishRepository._();

  List<Fish> _species = const [];
  List<FishCategory> _categories = const [];
  List<FlavorAxis> _flavorAxes = const [];
  bool _loaded = false;

  List<Fish> get species => _species;
  List<FishCategory> get categories => _categories;
  List<FlavorAxis> get flavorAxes => _flavorAxes;
  bool get isLoaded => _loaded;

  Future<void> load() async {
    if (_loaded) return;
    final raw = await rootBundle.loadString('assets/data/fish.json');
    final json = jsonDecode(raw) as Map<String, dynamic>;

    _categories = (json['categories'] as List<dynamic>)
        .map((e) => FishCategory.fromJson(e as Map<String, dynamic>))
        .toList();

    _flavorAxes = (json['flavorAxes'] as List<dynamic>)
        .map((e) => FlavorAxis.fromJson(e as Map<String, dynamic>))
        .toList();

    _species = (json['species'] as List<dynamic>)
        .map((e) => Fish.fromJson(e as Map<String, dynamic>))
        .toList();

    _loaded = true;
  }

  Fish byId(String id) => _species.firstWhere((f) => f.id == id);

  int get speciesCount => _species.length;

  /// Categories that actually have at least one species, preserving the
  /// dataset order.
  List<FishCategory> get populatedCategories {
    final present = _species.map((f) => f.category).toSet();
    return _categories.where((c) => present.contains(c.key)).toList();
  }
}
