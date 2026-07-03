import 'package:flutter/material.dart';

import 'data/favorites_service.dart';
import 'data/fish_repository.dart';
import 'screens/home_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([
    FishRepository.instance.load(),
    FavoritesService.instance.load(),
  ]);
  runApp(const SakanaZukanApp());
}

class SakanaZukanApp extends StatelessWidget {
  const SakanaZukanApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'さかな図鑑',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: const HomeScreen(),
    );
  }
}
