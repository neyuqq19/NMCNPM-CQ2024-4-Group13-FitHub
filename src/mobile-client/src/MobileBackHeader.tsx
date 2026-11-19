import React from "react";
import { View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
export function MobileBackHeader({ onBack, onNotifications }: { onBack: () => void; onNotifications?: () => void }) {
 return <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:8}}><Pressable accessibilityRole="button" accessibilityLabel="Về trang chủ" onPress={onBack} style={{flexDirection:"row",alignItems:"center",gap:8,minHeight:44}}><Feather name="arrow-left" size={17} color="#aaaab6"/><Text style={{color:"#aaaab6",fontSize:14}}>Về trang chủ</Text></Pressable>{onNotifications && <Pressable accessibilityRole="button" accessibilityLabel="Thông báo" onPress={onNotifications} style={{padding:11,borderRadius:12,backgroundColor:"#26262d"}}><Feather name="bell" size={20} color="white"/></Pressable>}</View>;
}
