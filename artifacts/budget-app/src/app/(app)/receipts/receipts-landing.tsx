"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Receipt, Upload, Inbox, Clock, CheckCircle2, ArrowRight, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadReceiptModal } from "@/components/receipts/upload-modal";
import Link from "next/link";

export function ReceiptsLanding() {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 space-y-8">
      <UploadReceiptModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <div className="flex justify-center">
          <div className="p-4 rounded-2xl bg-primary/10">
            <Receipt className="w-10 h-10 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold">Smart Receipt Inbox</h1>
        <p className="text-muted-foreground">
          Upload receipts — AI extracts the merchant, date, total, and individual
          items, then routes them to your inbox for review.
        </p>
      </motion.div>

      {/* Main actions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <Button
          size="lg"
          className="h-14 text-base gap-3"
          onClick={() => setUploadOpen(true)}
        >
          <Upload className="w-5 h-5" />
          Upload a receipt
        </Button>
        <Link href="/settings/gmail" className="block">
          <Button
            size="lg"
            variant="outline"
            className="h-14 text-base gap-3 w-full"
          >
            <Mail className="w-5 h-5" />
            Import from Gmail
          </Button>
        </Link>
      </motion.div>

      {/* Quick links */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {[
          {
            href: "/receipts/inbox",
            icon: Inbox,
            label: "Inbox",
            desc: "Review pending receipts",
            color: "text-amber-500",
            bg: "bg-amber-500/10",
          },
          {
            href: "/receipts/inbox?status=CONFIRMED",
            icon: CheckCircle2,
            label: "Confirmed",
            desc: "Receipts added to budget",
            color: "text-green-500",
            bg: "bg-green-500/10",
          },
          {
            href: "/receipts/inbox?status=PROCESSING",
            icon: Clock,
            label: "Processing",
            desc: "Being read by AI",
            color: "text-blue-500",
            bg: "bg-blue-500/10",
          },
        ].map(({ href, icon: Icon, label, desc, color, bg }) => (
          <Link key={href} href={href}>
            <Card className="border-border hover:border-primary/40 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`p-2 rounded-lg ${bg} mt-0.5`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto self-center shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          How it works
        </p>
        <div className="space-y-2">
          {[
            { n: 1, text: "Upload a photo or PDF of your receipt" },
            { n: 2, text: "AI reads the merchant, date, total, and line items" },
            { n: 3, text: "Review the data, assign categories, and confirm" },
            { n: 4, text: "The expense is added to your budget automatically" },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {n}
              </span>
              <p className="text-sm">{text}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
