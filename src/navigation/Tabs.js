// Role-based bottom tab navigators.
//   Househelp: Home | Find Jobs | Applications | Chat | Profile
//   Employer:  Home | My Jobs  | Maids        | Chat | Profile
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import HomeScreen from '../screens/HomeScreen';
import FindJobsScreen from '../screens/FindJobsScreen';
import ApplicationsScreen from '../screens/ApplicationsScreen';
import MyJobsScreen from '../screens/MyJobsScreen';
import MaidsScreen from '../screens/MaidsScreen';
import ChatsScreen from '../screens/ChatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors, radius } from '../theme';

const HousehelpTabsNav = createBottomTabNavigator();
const EmployerTabsNav = createBottomTabNavigator();

// Root-stack route name of the tab layout for a given user.
export const tabsRouteFor = (user) =>
  user?.role === 'househelp' ? 'HousehelpTabs' : 'EmployerTabs';

// Tab bar styling — deliberately NO custom height and NO position:'absolute'.
// React Navigation v7 then automatically pads the bar by the system
// navigation-bar/gesture inset (bottom), so the tabs are never hidden behind
// the phone's own navigation bar on edge-to-edge Android or iOS home screens.
const TAB_BAR = {
  headerShown: false,
  tabBarActiveTintColor: colors.brand,
  tabBarInactiveTintColor: colors.muted,
  tabBarStyle: {
    backgroundColor: colors.card,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 6,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
};

function icon(name, focused) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={23} color={focused ? colors.brand : colors.muted} />;
}

export function HousehelpTabs() {
  return (
    <HousehelpTabsNav.Navigator screenOptions={TAB_BAR}>
      <HousehelpTabsNav.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => icon('home', focused) }}
      />
      <HousehelpTabsNav.Screen
        name="FindJobsTab"
        component={FindJobsScreen}
        options={{ title: 'Find Jobs', tabBarIcon: ({ focused }) => icon('search', focused) }}
      />
      <HousehelpTabsNav.Screen
        name="ApplicationsTab"
        component={ApplicationsScreen}
        options={{ title: 'Applications', tabBarIcon: ({ focused }) => icon('document-text', focused) }}
      />
      <HousehelpTabsNav.Screen
        name="ChatsTab"
        component={ChatsScreen}
        options={{ title: 'Chat', tabBarIcon: ({ focused }) => icon('chatbubbles', focused) }}
      />
      <HousehelpTabsNav.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => icon('person', focused) }}
      />
    </HousehelpTabsNav.Navigator>
  );
}

export function EmployerTabs() {
  return (
    <EmployerTabsNav.Navigator screenOptions={TAB_BAR}>
      <EmployerTabsNav.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: 'Home', tabBarIcon: ({ focused }) => icon('home', focused) }}
      />
      <EmployerTabsNav.Screen
        name="MyJobsTab"
        component={MyJobsScreen}
        options={{ title: 'My Jobs', tabBarIcon: ({ focused }) => icon('briefcase', focused) }}
      />
      <EmployerTabsNav.Screen
        name="MaidsTab"
        component={MaidsScreen}
        options={{ title: 'Maids', tabBarIcon: ({ focused }) => icon('people', focused) }}
      />
      <EmployerTabsNav.Screen
        name="ChatsTab"
        component={ChatsScreen}
        options={{ title: 'Chats', tabBarIcon: ({ focused }) => icon('chatbubbles', focused) }}
      />
      <EmployerTabsNav.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => icon('person', focused) }}
      />
    </EmployerTabsNav.Navigator>
  );
}
