"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./mensagens.module.css";

import { redirect } from "next/navigation";

export default function MensagensPage() {
  redirect("/conversas");
}