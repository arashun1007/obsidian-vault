import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stores favourite species ids in local storage.
///
/// A [ChangeNotifier] so any widget can listen and rebuild when the set
/// changes. Backed by [SharedPreferences] which works across web, mobile
/// and desktop.
class FavoritesService extends ChangeNotifier {
  FavoritesService._();
  static final FavoritesService instance = FavoritesService._();

  static const _key = 'favorite_fish_ids';

  final Set<String> _ids = {};
  SharedPreferences? _prefs;

  Set<String> get ids => Set.unmodifiable(_ids);
  int get count => _ids.length;

  Future<void> load() async {
    _prefs = await SharedPreferences.getInstance();
    _ids
      ..clear()
      ..addAll(_prefs?.getStringList(_key) ?? const []);
    notifyListeners();
  }

  bool isFavorite(String id) => _ids.contains(id);

  Future<void> toggle(String id) async {
    if (!_ids.remove(id)) _ids.add(id);
    notifyListeners();
    await _prefs?.setStringList(_key, _ids.toList());
  }
}
